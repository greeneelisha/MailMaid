<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>MailMaid</title>
  <link rel="stylesheet" href="style.css">
</head>

<body>

  <div class="container">

    <div class="header">
      <h1>MailMaid</h1>
      <p>Clean up your Gmail</p>
    </div>

    <button id="clean" class="clean-button">
      Clean Now
    </button>

    <div class="status-card">
      <div class="status-title">Status</div>
      <div id="status">Ready</div>
    </div>

    <div class="stats">

      <div class="stat">
        <span id="processedCount">8,337</span>
        <small>Messages scanned</small>
      </div>

      <div class="stat">
        <span id="filterCount">0</span>
        <small>Rules</small>
      </div>

    </div>

    <div id="error" class="error"></div>

    <div class="settings-section">

      <label for="interval">
        Automatic cleaning
      </label>

      <select id="interval">
        <option value="1">Every minute</option>
        <option value="5">Every 5 minutes</option>
        <option value="15">Every 15 minutes</option>
        <option value="30">Every 30 minutes</option>
        <option value="60">Every hour</option>
        <option value="360">Every 6 hours</option>
        <option value="1440">Every day</option>
      </select>

      <label class="checkbox-row">
        <input type="checkbox" id="autoClean">
        <span>Enable automatic cleaning</span>
      </label>

    </div>

    <button id="settings" class="settings-button">
      Settings
    </button>

  </div>

  <script src="popup.js"></script>

</body>
</html>