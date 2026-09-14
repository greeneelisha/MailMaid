const cleanButton = document.getElementById("clean");
const intervalInput = document.getElementById("interval");
const autoClean = document.getElementById("autoClean");
const status = document.getElementById("status");
const settingsButton = document.getElementById("settings");

const processedCount =
  document.getElementById("processedCount");

const filterCount =
  document.getElementById("filterCount");

const errorBox =
  document.getElementById("error");


function showError(message) {
  if (!message) {
    errorBox.style.display = "none";
    errorBox.textContent = "";
    return;
  }

  errorBox.style.display = "block";
  errorBox.textContent = message;
}


function loadSettings() {

  chrome.storage.local.get(
    [
      "interval",
      "autoClean",
      "filterCount",
      "processedCount",
      "lastError",
      "status"
    ],
    (data) => {

      intervalInput.value =
        data.interval || 1;

      autoClean.checked =
        Boolean(data.autoClean);

      const count =
        typeof data.processedCount === "number"
          ? data.processedCount
          : 8337;

      processedCount.textContent =
        count.toLocaleString();

      filterCount.textContent =
        data.filterCount || 0;

      status.textContent =
        data.status || "Ready";

      showError(
        data.lastError || ""
      );
    }
  );
}


function saveSettings() {

  const interval =
    Number(intervalInput.value);

  const enabled =
    autoClean.checked;

  chrome.storage.local.set(
    {
      interval: interval,
      autoClean: enabled
    },
    () => {

      chrome.runtime.sendMessage({
        type: "UPDATE_ALARM"
      });

    }
  );
}


cleanButton.addEventListener(
  "click",
  () => {

    cleanButton.disabled = true;

    status.textContent =
      "Starting...";

    showError("");

    chrome.runtime.sendMessage(
      {
        type: "CLEAN_NOW"
      },
      (response) => {

        if (chrome.runtime.lastError) {

          status.textContent =
            "Error";

          showError(
            chrome.runtime.lastError.message
          );

          cleanButton.disabled = false;

          return;
        }

        if (
          response &&
          response.error
        ) {

          status.textContent =
            "Error";

          showError(
            response.error
          );

          cleanButton.disabled = false;

          return;
        }

        status.textContent =
          "Working...";

        cleanButton.disabled = false;
      }
    );
  }
);


intervalInput.addEventListener(
  "change",
  saveSettings
);


autoClean.addEventListener(
  "change",
  saveSettings
);


settingsButton.addEventListener(
  "click",
  () => {
    chrome.runtime.openOptionsPage();
  }
);


chrome.storage.onChanged.addListener(
  (changes) => {

    if (changes.processedCount) {

      processedCount.textContent =
        Number(
          changes.processedCount.newValue || 0
        ).toLocaleString();
    }

    if (changes.filterCount) {

      filterCount.textContent =
        changes.filterCount.newValue || 0;
    }

    if (changes.status) {

      status.textContent =
        changes.status.newValue || "Ready";
    }

    if (changes.lastError) {

      showError(
        changes.lastError.newValue || ""
      );
    }
  }
);


loadSettings();