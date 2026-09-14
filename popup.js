var savedChecked = 0;
var savedMatched = 0;

var currentScanProcessed = 0;
var currentScanMatched = 0;
var currentScanTotal = 0;

var isRunning = false;

function $(id) {
    return document.getElementById(id);
}

function updateDisplayedCounters() {
    if (isRunning) {
        $("checked").textContent =
            savedChecked + currentScanProcessed;

        $("matched").textContent =
            savedMatched + currentScanMatched;
    } else {
        $("checked").textContent = savedChecked;
        $("matched").textContent = savedMatched;
    }
}

function formatTime(timestamp) {
    if (!timestamp) {
        return "Never";
    }

    return new Date(timestamp).toLocaleTimeString();
}

function updateStatus() {
    chrome.runtime.sendMessage(
        { action: "getStatus" },
        function(response) {
            if (chrome.runtime.lastError) {
                return;
            }

            if (!response) {
                return;
            }

            savedChecked =
                Number(response.processedCount || 0);

            savedMatched =
                Number(response.filterCount || 0);

            isRunning =
                response.running === true;

            if (isRunning) {
                currentScanProcessed =
                    Number(response.processed || 0);

                currentScanMatched =
                    Number(response.matched || 0);

                currentScanTotal =
                    Number(response.total || 0);
            }

            updateDisplayedCounters();

            if (response.autoClean) {
                $("autoClean").checked = true;
                $("statusTitle").textContent =
                    "Auto Clean ON";

                $("statusDot").className =
                    "dot on";

                if (response.nextScanTime) {
                    updateCountdown(
                        response.nextScanTime
                    );
                }
            } else {
                $("autoClean").checked = false;
                $("statusTitle").textContent =
                    "Auto Clean OFF";

                $("statusDot").className =
                    "dot";

                $("countdown").textContent = "—";

                $("countdownLabel").textContent =
                    "Auto Clean is off";
            }

            if (isRunning) {
                $("statusDot").className =
                    "dot scanning";

                $("progressText").textContent =
                    "Scanning " +
                    currentScanProcessed +
                    " of " +
                    currentScanTotal;

                if (currentScanTotal > 0) {
                    var percent =
                        (
                            currentScanProcessed /
                            currentScanTotal
                        ) * 100;

                    $("progress").style.width =
                        percent + "%";
                } else {
                    $("progress").style.width =
                        "0%";
                }
            }

            $("lastScan").textContent =
                "Last scan: " +
                formatTime(
                    response.lastScanTime
                );
        }
    );
}

function updateCountdown(nextScanTime) {
    var remaining =
        nextScanTime - Date.now();

    if (remaining <= 0) {
        $("countdown").textContent = "NOW";

        $("countdownLabel").textContent =
            "Starting scan...";

        return;
    }

    var seconds =
        Math.ceil(remaining / 1000);

    var minutes =
        Math.floor(seconds / 60);

    var secs =
        seconds % 60;

    $("countdown").textContent =
        minutes +
        ":" +
        (secs < 10 ? "0" : "") +
        secs;

    $("countdownLabel").textContent =
        "Next scan";
}

$("autoClean").addEventListener(
    "change",
    function() {
        var enabled =
            $("autoClean").checked;

        var interval =
            Number($("interval").value);

        if (!interval || interval < 1) {
            interval = 1;
            $("interval").value = 1;
        }

        if (enabled) {
            chrome.runtime.sendMessage(
                {
                    action: "start",
                    interval: interval
                },
                function() {
                    updateStatus();
                }
            );
        } else {
            chrome.runtime.sendMessage(
                {
                    action: "stop"
                },
                function() {
                    updateStatus();
                }
            );
        }
    }
);

$("interval").addEventListener(
    "change",
    function() {
        var interval =
            Number($("interval").value);

        if (!interval || interval < 1) {
            interval = 1;
            $("interval").value = 1;
        }

        if ($("autoClean").checked) {
            chrome.runtime.sendMessage(
                {
                    action: "start",
                    interval: interval
                },
                function() {
                    updateStatus();
                }
            );
        }
    }
);

$("clean").addEventListener(
    "click",
    function() {
        $("clean").disabled = true;

        /*
         * IMPORTANT:
         * Do NOT reset savedChecked or savedMatched here.
         * The current scan is added on top of the old totals.
         */

        currentScanProcessed = 0;
        currentScanMatched = 0;
        currentScanTotal = 0;

        isRunning = true;

        updateDisplayedCounters();

        $("progress").style.width = "0%";

        $("progressText").textContent =
            "Starting scan...";

        chrome.runtime.sendMessage(
            {
                action: "cleanNow"
            },
            function() {
                if (chrome.runtime.lastError) {
                    $("clean").disabled = false;

                    $("progressText").textContent =
                        "Error: " +
                        chrome.runtime.lastError.message;

                    return;
                }
            }
        );
    }
);

$("settings").addEventListener(
    "click",
    function() {
        chrome.runtime.openOptionsPage();
    }
);

chrome.runtime.onMessage.addListener(
    function(message) {
        if (!message || !message.action) {
            return;
        }

        if (message.action === "cleanStarted") {
            isRunning = true;

            currentScanProcessed = 0;
            currentScanMatched = 0;
            currentScanTotal = 0;

            $("progress").style.width = "0%";

            $("progressText").textContent =
                "Starting scan...";

            $("clean").disabled = true;

            updateDisplayedCounters();
        }

        if (message.action === "progress") {
            isRunning = true;

            currentScanProcessed =
                Number(message.processed || 0);

            currentScanMatched =
                Number(message.matched || 0);

            currentScanTotal =
                Number(message.total || 0);

            updateDisplayedCounters();

            $("progressText").textContent =
                "Scanning " +
                currentScanProcessed +
                " of " +
                currentScanTotal;

            if (currentScanTotal > 0) {
                var percent =
                    (
                        currentScanProcessed /
                        currentScanTotal
                    ) * 100;

                $("progress").style.width =
                    percent + "%";
            }
        }

        if (message.action === "cleanFinished") {
            isRunning = false;

            $("progress").style.width = "100%";

            $("progressText").textContent =
                "Scan complete";

            $("clean").disabled = false;

            /*
             * Get the actual cumulative totals
             * from storage through the background.
             */
            setTimeout(
                function() {
                    updateStatus();
                },
                300
            );
        }

        if (message.action === "cleanError") {
            isRunning = false;

            $("clean").disabled = false;

            $("progressText").textContent =
                "Error: " +
                (message.error || "Unknown error");

            updateStatus();
        }
    }
);

setInterval(
    function() {
        chrome.runtime.sendMessage(
            { action: "getStatus" },
            function(response) {
                if (chrome.runtime.lastError) {
                    return;
                }

                if (
                    response &&
                    response.nextScanTime
                ) {
                    updateCountdown(
                        response.nextScanTime
                    );
                }
            }
        );
    },
    1000
);

updateStatus();