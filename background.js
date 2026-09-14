var scanStatus = {
    running: false,
    processed: 0,
    matched: 0,
    total: 0
};

function getToken() {
    return new Promise(function(resolve, reject) {
        chrome.identity.getAuthToken(
            { interactive: true },
            function(token) {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (!token) {
                    reject(new Error("No Google authentication token"));
                    return;
                }

                resolve(token);
            }
        );
    });
}

async function gmailRequest(url, options) {
    var response = await fetch(url, options);

    if (!response.ok) {
        var text = await response.text();
        throw new Error(
            "Gmail API error " +
            response.status +
            ": " +
            text
        );
    }

    return response.json();
}

async function getMessages(token, afterTimestamp) {
    var messages = [];
    var pageToken = null;

    var query = "";

    if (afterTimestamp) {
        query = "after:" + Math.floor(afterTimestamp / 1000);
    }

    do {
        var url =
            "https://gmail.googleapis.com/gmail/v1/users/me/messages" +
            "?maxResults=100";

        if (query) {
            url += "&q=" + encodeURIComponent(query);
        }

        if (pageToken) {
            url += "&pageToken=" + encodeURIComponent(pageToken);
        }

        var data = await gmailRequest(
            url,
            {
                method: "GET",
                headers: {
                    Authorization: "Bearer " + token
                }
            }
        );

        if (data.messages) {
            messages = messages.concat(data.messages);
        }

        pageToken = data.nextPageToken || null;

    } while (pageToken);

    return messages;
}

async function getMessage(token, id) {
    var url =
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/" +
        encodeURIComponent(id) +
        "?format=full";

    return gmailRequest(
        url,
        {
            method: "GET",
            headers: {
                Authorization: "Bearer " + token
            }
        }
    );
}

function getHeader(headers, name) {
    if (!headers) {
        return "";
    }

    var wanted = name.toLowerCase();

    for (var i = 0; i < headers.length; i++) {
        if (
            headers[i].name &&
            headers[i].name.toLowerCase() === wanted
        ) {
            return headers[i].value || "";
        }
    }

    return "";
}

function decodeBase64Url(data) {
    if (!data) {
        return "";
    }

    try {
        var base64 = data
            .replace(/-/g, "+")
            .replace(/_/g, "/");

        while (base64.length % 4) {
            base64 += "=";
        }

        var binary = atob(base64);
        var bytes = new Uint8Array(binary.length);

        for (var i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        return new TextDecoder("utf-8").decode(bytes);

    } catch (error) {
        return "";
    }
}

function extractTextFromPart(part) {
    if (!part) {
        return "";
    }

    var result = "";

    if (
        part.mimeType === "text/plain" &&
        part.body &&
        part.body.data
    ) {
        result += decodeBase64Url(part.body.data);
    }

    if (part.parts) {
        for (var i = 0; i < part.parts.length; i++) {
            result += "\n" + extractTextFromPart(part.parts[i]);
        }
    }

    return result;
}

function extractMessageData(message) {
    var headers = [];

    if (
        message.payload &&
        message.payload.headers
    ) {
        headers = message.payload.headers;
    }

    var from = getHeader(headers, "From");
    var to = getHeader(headers, "To");
    var subject = getHeader(headers, "Subject");

    var body = "";

    if (message.payload) {
        body = extractTextFromPart(message.payload);
    }

    return {
        from: from,
        to: to,
        subject: subject,
        body: body
    };
}

function containsText(value, search) {
    if (!search) {
        return false;
    }

    return String(value || "")
        .toLowerCase()
        .indexOf(String(search).toLowerCase()) !== -1;
}

function ruleMatches(rule, data) {
    if (!rule) {
        return false;
    }

    if (
        rule.fromContains &&
        !containsText(data.from, rule.fromContains)
    ) {
        return false;
    }

    if (
        rule.fromNotContains &&
        containsText(data.from, rule.fromNotContains)
    ) {
        return false;
    }

    if (
        rule.toContains &&
        !containsText(data.to, rule.toContains)
    ) {
        return false;
    }

    if (
        rule.toNotContains &&
        containsText(data.to, rule.toNotContains)
    ) {
        return false;
    }

    if (
        rule.subjectContains &&
        !containsText(data.subject, rule.subjectContains)
    ) {
        return false;
    }

    if (
        rule.subjectNotContains &&
        containsText(data.subject, rule.subjectNotContains)
    ) {
        return false;
    }

    if (
        rule.messageContains &&
        !containsText(data.body, rule.messageContains)
    ) {
        return false;
    }

    if (
        rule.messageNotContains &&
        containsText(data.body, rule.messageNotContains)
    ) {
        return false;
    }

    return true;
}

async function modifyMessage(token, messageId, addLabelIds, removeLabelIds) {
    var url =
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/" +
        encodeURIComponent(messageId) +
        "/modify";

    var response = await fetch(
        url,
        {
            method: "POST",
            headers: {
                Authorization: "Bearer " + token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                addLabelIds: addLabelIds || [],
                removeLabelIds: removeLabelIds || []
            })
        }
    );

    if (!response.ok) {
        var errorText = await response.text();

        throw new Error(
            "Modify error " +
            response.status +
            ": " +
            errorText
        );
    }
}

async function applyRule(token, messageId, rule) {
    if (rule.archive) {
        await modifyMessage(
            token,
            messageId,
            [],
            ["INBOX"]
        );
    }

    if (rule.markRead) {
        await modifyMessage(
            token,
            messageId,
            [],
            ["UNREAD"]
        );
    }

    if (rule.star) {
        await modifyMessage(
            token,
            messageId,
            ["STARRED"],
            []
        );
    }

    if (rule.neverSpam) {
        await modifyMessage(
            token,
            messageId,
            [],
            ["SPAM"]
        );
    }

    if (rule.important) {
        await modifyMessage(
            token,
            messageId,
            ["IMPORTANT"],
            []
        );
    }

    if (rule.notImportant) {
        await modifyMessage(
            token,
            messageId,
            [],
            ["IMPORTANT"]
        );
    }

    if (rule.delete) {
        await modifyMessage(
            token,
            messageId,
            ["TRASH"],
            []
        );
    }
}

function sendProgress(processed, matched, total) {
    scanStatus.processed = processed;
    scanStatus.matched = matched;
    scanStatus.total = total;

    chrome.runtime.sendMessage(
        {
            action: "progress",
            processed: processed,
            matched: matched,
            total: total
        }
    ).catch(function() {});
}

async function runRules() {
    if (scanStatus.running) {
        return;
    }

    scanStatus.running = true;
    scanStatus.processed = 0;
    scanStatus.matched = 0;
    scanStatus.total = 0;

    chrome.runtime.sendMessage(
        {
            action: "cleanStarted"
        }
    ).catch(function() {});

    try {
        var stored = await chrome.storage.local.get([
            "cleanerRules",
            "scannedMessageIds",
            "lastScanTime",
            "processedCount",
            "filterCount"
        ]);

        var rules = stored.cleanerRules || [];
        var scannedIds = stored.scannedMessageIds || [];
        var lastScanTime = stored.lastScanTime || 0;

        var previousProcessed =
            stored.processedCount || 0;

        var previousMatched =
            stored.filterCount || 0;

        var scannedSet = {};

        for (var i = 0; i < scannedIds.length; i++) {
            scannedSet[scannedIds[i]] = true;
        }

        var token = await getToken();

        var messages = await getMessages(
            token,
            lastScanTime
        );

        var newMessages = [];

        for (var j = 0; j < messages.length; j++) {
            if (!scannedSet[messages[j].id]) {
                newMessages.push(messages[j]);
            }
        }

        scanStatus.total = newMessages.length;

        sendProgress(
            0,
            0,
            newMessages.length
        );

        var processedThisScan = 0;
        var matchedThisScan = 0;

        for (var k = 0; k < newMessages.length; k++) {
            var messageId = newMessages[k].id;

            try {
                var message = await getMessage(
                    token,
                    messageId
                );

                var data = extractMessageData(message);

                for (var r = 0; r < rules.length; r++) {
                    var rule = rules[r];

                    if (ruleMatches(rule, data)) {
                        matchedThisScan++;

                        await applyRule(
                            token,
                            messageId,
                            rule
                        );
                    }
                }

                scannedIds.push(messageId);
                scannedSet[messageId] = true;

            } catch (messageError) {
                console.error(
                    "Error processing message:",
                    messageId,
                    messageError
                );
            }

            processedThisScan++;

            sendProgress(
                processedThisScan,
                matchedThisScan,
                newMessages.length
            );
        }

        var now = Date.now();

        await chrome.storage.local.set({
            scannedMessageIds: scannedIds,
            lastScanTime: now,
            processedCount:
                previousProcessed + processedThisScan,
            filterCount:
                previousMatched + matchedThisScan,
            lastRun: now,
            lastError: null
        });

        chrome.runtime.sendMessage(
            {
                action: "cleanFinished",
                processed: processedThisScan,
                matched: matchedThisScan
            }
        ).catch(function() {});

    } catch (error) {
        console.error(
            "Gmail Cleaner scan error:",
            error
        );

        await chrome.storage.local.set({
            lastError: error.message || String(error)
        });

        chrome.runtime.sendMessage(
            {
                action: "cleanError",
                error: error.message || String(error)
            }
        ).catch(function() {});

    } finally {
        scanStatus.running = false;
    }
}

function createAlarm(minutes) {
    var interval = Number(minutes);

    if (!interval || interval < 1) {
        interval = 1;
    }

    chrome.alarms.clear(
        "gmailCleaner",
        function() {
            chrome.alarms.create(
                "gmailCleaner",
                {
                    delayInMinutes: interval,
                    periodInMinutes: interval
                }
            );

            chrome.storage.local.set({
                autoCleanInterval: interval
            });
        }
    );
}

chrome.runtime.onInstalled.addListener(
    function() {
        chrome.storage.local.get(
            ["autoClean", "autoCleanInterval"],
            function(data) {
                if (
                    data.autoClean &&
                    data.autoCleanInterval
                ) {
                    createAlarm(
                        data.autoCleanInterval
                    );
                }
            }
        );
    }
);

chrome.runtime.onStartup.addListener(
    function() {
        chrome.storage.local.get(
            ["autoClean", "autoCleanInterval"],
            function(data) {
                if (
                    data.autoClean &&
                    data.autoCleanInterval
                ) {
                    createAlarm(
                        data.autoCleanInterval
                    );
                }
            }
        );
    }
);

chrome.alarms.onAlarm.addListener(
    function(alarm) {
        if (alarm.name !== "gmailCleaner") {
            return;
        }

        chrome.storage.local.set({
            nextScanTime: Date.now() +
                (
                    Number(
                        alarm.periodInMinutes || 1
                    ) *
                    60 *
                    1000
                )
        });

        runRules();
    }
);

chrome.runtime.onMessage.addListener(
    function(message, sender, sendResponse) {
        if (!message || !message.action) {
            return;
        }

        if (message.action === "cleanNow") {
            runRules();

            sendResponse({
                ok: true
            });

            return true;
        }

        if (message.action === "start") {
            createAlarm(
                message.interval || 1
            );

            chrome.storage.local.set({
                autoClean: true,
                autoCleanInterval:
                    Number(message.interval || 1)
            });

            sendResponse({
                ok: true
            });

            return true;
        }

        if (message.action === "stop") {
            chrome.alarms.clear(
                "gmailCleaner",
                function() {
                    chrome.storage.local.set({
                        autoClean: false,
                        nextScanTime: null
                    });

                    sendResponse({
                        ok: true
                    });
                }
            );

            return true;
        }

        if (message.action === "getStatus") {
            chrome.storage.local.get(
                [
                    "autoClean",
                    "autoCleanInterval",
                    "nextScanTime",
                    "lastRun",
                    "lastScanTime",
                    "processedCount",
                    "filterCount",
                    "lastError"
                ],
                function(data) {
                    sendResponse({
                        ok: true,
                        running: scanStatus.running,
                        processed: scanStatus.processed,
                        matched: scanStatus.matched,
                        total: scanStatus.total,
                        autoClean:
                            data.autoClean || false,
                        autoCleanInterval:
                            data.autoCleanInterval || 1,
                        nextScanTime:
                            data.nextScanTime || null,
                        lastRun:
                            data.lastRun || null,
                        lastScanTime:
                            data.lastScanTime || null,
                        processedCount:
                            data.processedCount || 0,
                        filterCount:
                            data.filterCount || 0,
                        lastError:
                            data.lastError || null
                    });
                }
            );

            return true;
        }
    }
);

console.log(
    "Gmail Cleaner background loaded"
);