const ALARM_NAME = "mailMaidCleaner";
const BASE_COUNT = 8337;

let cleaning = false;


function splitValues(value) {

  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map(
      value =>
        value.trim().toLowerCase()
    )
    .filter(Boolean);
}


function containsMatch(
  text,
  values
) {

  if (!values.length) {
    return true;
  }

  const lower =
    String(text || "")
      .toLowerCase();

  return values.some(
    value =>
      lower.includes(value)
  );
}


function notContainsMatch(
  text,
  values
) {

  if (!values.length) {
    return true;
  }

  const lower =
    String(text || "")
      .toLowerCase();

  return values.every(
    value =>
      !lower.includes(value)
  );
}


function headerValue(
  headers,
  name
) {

  const wanted =
    name.toLowerCase();

  const header =
    headers.find(
      h =>
        h.name.toLowerCase() ===
        wanted
    );

  return header
    ? header.value
    : "";
}


function decodeBase64Url(data) {

  if (!data) {
    return "";
  }

  try {

    const normalized =
      data
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const binary =
      atob(normalized);

    const bytes =
      Uint8Array.from(
        binary,
        character =>
          character.charCodeAt(0)
      );

    return new TextDecoder()
      .decode(bytes);

  } catch (error) {

    return "";
  }
}


function extractText(payload) {

  if (!payload) {
    return "";
  }


  if (
    payload.mimeType ===
      "text/plain" &&
    payload.body &&
    payload.body.data
  ) {

    return decodeBase64Url(
      payload.body.data
    );
  }


  if (payload.parts) {

    let text = "";

    for (
      const part of payload.parts
    ) {

      const result =
        extractText(part);

      if (result) {
        text += result + "\n";
      }
    }

    return text;
  }


  if (
    payload.body &&
    payload.body.data
  ) {

    return decodeBase64Url(
      payload.body.data
    );
  }


  return "";
}


function matchesRule(
  message,
  rule
) {

  const headers =
    message.payload?.headers || [];

  const from =
    headerValue(
      headers,
      "From"
    );

  const to =
    headerValue(
      headers,
      "To"
    );

  const subject =
    headerValue(
      headers,
      "Subject"
    );

  const body =
    extractText(
      message.payload
    );


  return (

    containsMatch(
      from,
      splitValues(
        rule.fromContains
      )
    )

    &&

    notContainsMatch(
      from,
      splitValues(
        rule.fromNotContains
      )
    )

    &&

    containsMatch(
      to,
      splitValues(
        rule.toContains
      )
    )

    &&

    notContainsMatch(
      to,
      splitValues(
        rule.toNotContains
      )
    )

    &&

    containsMatch(
      subject,
      splitValues(
        rule.subjectContains
      )
    )

    &&

    notContainsMatch(
      subject,
      splitValues(
        rule.subjectNotContains
      )
    )

    &&

    containsMatch(
      body,
      splitValues(
        rule.messageContains
      )
    )

    &&

    notContainsMatch(
      body,
      splitValues(
        rule.messageNotContains
      )
    )
  );
}


function setStatus(text) {

  chrome.storage.local.set({
    status: text
  });
}


function setError(error) {

  chrome.storage.local.set({
    lastError:
      error || ""
  });
}


async function getToken() {

  return new Promise(
    (resolve, reject) => {

      chrome.identity.getAuthToken(
        {
          interactive: true
        },
        token => {

          if (
            chrome.runtime.lastError
          ) {

            reject(
              new Error(
                chrome.runtime
                  .lastError
                  .message
              )
            );

            return;
          }


          if (!token) {

            reject(
              new Error(
                "Google authentication failed."
              )
            );

            return;
          }


          resolve(token);
        }
      );
    }
  );
}


async function gmailRequest(
  token,
  url,
  options = {}
) {

  const response =
    await fetch(
      url,
      {
        ...options,

        headers: {
          ...(options.headers || {}),

          Authorization:
            `Bearer ${token}`
        }
      }
    );


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `Gmail API ${response.status}: ${text}`
    );
  }


  return response.json();
}


async function listAllMessages(
  token
) {

  const messages = [];

  let pageToken = null;


  do {

    let url =
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=500";


    if (pageToken) {

      url +=
        `&pageToken=${encodeURIComponent(
          pageToken
        )}`;
    }


    const data =
      await gmailRequest(
        token,
        url
      );


    if (data.messages) {

      messages.push(
        ...data.messages
      );
    }


    pageToken =
      data.nextPageToken ||
      null;


    await chrome.storage.local.set({
      processedCount:
        BASE_COUNT +
        messages.length
    });


  } while (pageToken);


  return messages;
}


async function getMessage(
  token,
  id
) {

  return gmailRequest(
    token,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`
  );
}


async function modifyMessage(
  token,
  id,
  addLabelIds,
  removeLabelIds
) {

  return gmailRequest(
    token,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        addLabelIds:
          addLabelIds || [],

        removeLabelIds:
          removeLabelIds || []
      })
    }
  );
}


async function getLabels(
  token
) {

  const data =
    await gmailRequest(
      token,
      "https://gmail.googleapis.com/gmail/v1/users/me/labels"
    );

  return data.labels || [];
}


async function createLabel(
  token,
  name
) {

  return gmailRequest(
    token,
    "https://gmail.googleapis.com/gmail/v1/users/me/labels",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        name: name,
        labelListVisibility:
          "labelShow",
        messageListVisibility:
          "show"
      })
    }
  );
}


async function getOrCreateLabel(
  token,
  labels,
  name
) {

  const existing =
    labels.find(
      label =>
        label.name.toLowerCase() ===
        name.toLowerCase()
    );


  if (existing) {
    return existing;
  }


  const created =
    await createLabel(
      token,
      name
    );


  labels.push(created);

  return created;
}


function getActionLabels(
  rule
) {

  const add = [];
  const remove = [];


  if (rule.actions?.archive) {
    remove.push("INBOX");
  }


  if (rule.actions?.read) {
    remove.push("UNREAD");
  }


  if (rule.actions?.star) {
    add.push("STARRED");
  }


  if (rule.actions?.delete) {
    add.push("TRASH");
  }


  if (rule.actions?.neverSpam) {
    remove.push("SPAM");
  }


  if (rule.actions?.important) {
    add.push("IMPORTANT");
  }


  if (rule.actions?.notImportant) {
    remove.push("IMPORTANT");
  }


  if (rule.category) {

    const categories = [
      "CATEGORY_PERSONAL",
      "CATEGORY_SOCIAL",
      "CATEGORY_PROMOTIONS",
      "CATEGORY_UPDATES",
      "CATEGORY_FORUMS"
    ];


    categories.forEach(
      category => {

        if (
          category !==
          rule.category
        ) {

          remove.push(category);
        }
      }
    );


    add.push(
      rule.category
    );
  }


  return {
    add,
    remove
  };
}


async function applyRule(
  token,
  message,
  rule,
  labels
) {

  const add = [];
  const remove = [];


  const actionLabels =
    getActionLabels(rule);


  add.push(
    ...actionLabels.add
  );

  remove.push(
    ...actionLabels.remove
  );


  if (rule.label) {

    const label =
      await getOrCreateLabel(
        token,
        labels,
        rule.label
      );


    if (label?.id) {

      add.push(
        label.id
      );
    }
  }


  if (
    add.length ||
    remove.length
  ) {

    await modifyMessage(
      token,
      message.id,
      [...new Set(add)],
      [...new Set(remove)]
    );
  }
}


async function cleanGmail() {

  if (cleaning) {

    return {
      error:
        "MailMaid is already running."
    };
  }


  cleaning = true;


  try {

    await setError("");

    await setStatus(
      "Signing in..."
    );


    const token =
      await getToken();


    await setStatus(
      "Finding Gmail messages..."
    );


    const messages =
      await listAllMessages(
        token
      );


    const data =
      await chrome.storage.local.get(
        ["rules"]
      );


    const rules =
      data.rules || [];


    await chrome.storage.local.set({
      filterCount:
        rules.length
    });


    if (!rules.length) {

      await setStatus(
        "No rules configured."
      );

      return {
        success: true,
        processed: 0
      };
    }


    await setStatus(
      `Found ${messages.length.toLocaleString()} messages`
    );


    const labels =
      await getLabels(token);


    let processed = 0;
    let matched = 0;


    for (
      const messageRef of messages
    ) {

      const message =
        await getMessage(
          token,
          messageRef.id
        );


      for (
        const rule of rules
      ) {

        if (
          matchesRule(
            message,
            rule
          )
        ) {

          await applyRule(
            token,
            message,
            rule,
            labels
          );

          matched++;
        }
      }


      processed++;


      await chrome.storage.local.set({
        processedCount:
          BASE_COUNT +
          processed
      });


      if (
        processed % 25 === 0 ||
        processed === messages.length
      ) {

        await setStatus(
          `Working... ${processed.toLocaleString()} / ${messages.length.toLocaleString()}`
        );
      }
    }


    await setStatus(
      `Finished — ${matched.toLocaleString()} matches`
    );


    return {
      success: true,
      processed: processed,
      matched: matched
    };


  } catch (error) {

    console.error(
      "MailMaid error:",
      error
    );


    const message =
      error?.message ||
      String(error);


    await setStatus(
      "Error"
    );

    await setError(
      message
    );


    return {
      error: message
    };


  } finally {

    cleaning = false;
  }
}


chrome.runtime.onMessage.addListener(
  (
    message,
    sender,
    sendResponse
  ) => {

    if (
      message.type ===
      "CLEAN_NOW"
    ) {

      cleanGmail()
        .then(result => {
          sendResponse(result);
        })
        .catch(error => {

          sendResponse({
            error:
              error.message
          });

        });


      return true;
    }


    if (
      message.type ===
      "UPDATE_ALARM"
    ) {

      setupAlarm()
        .then(() => {

          sendResponse({
            success: true
          });

        });


      return true;
    }
  }
);


async function setupAlarm() {

  const data =
    await chrome.storage.local.get(
      [
        "interval",
        "autoClean"
      ]
    );


  await chrome.alarms.clear(
    ALARM_NAME
  );


  if (!data.autoClean) {
    return;
  }


  const minutes =
    Number(data.interval) || 1;


  chrome.alarms.create(
    ALARM_NAME,
    {
      delayInMinutes: minutes,
      periodInMinutes: minutes
    }
  );
}


chrome.alarms.onAlarm.addListener(
  alarm => {

    if (
      alarm.name ===
      ALARM_NAME
    ) {

      cleanGmail();
    }
  }
);


chrome.runtime.onInstalled.addListener(
  async () => {

    const data =
      await chrome.storage.local.get(
        [
          "interval",
          "autoClean",
          "processedCount"
        ]
      );


    const updates = {};


    if (!data.interval) {
      updates.interval = 1;
    }


    if (
      typeof data.autoClean !==
      "boolean"
    ) {

      updates.autoClean = false;
    }


    if (
      typeof data.processedCount !==
      "number"
    ) {

      updates.processedCount =
        BASE_COUNT;
    }


    if (
      Object.keys(updates).length
    ) {

      await chrome.storage.local.set(
        updates
      );
    }


    await setupAlarm();
  }
);


setupAlarm();