const rulesContainer =
  document.getElementById("rules");

const addRuleButton =
  document.getElementById("addRule");

const saveButton =
  document.getElementById("save");

const saveStatus =
  document.getElementById("saveStatus");

const template =
  document.getElementById("ruleTemplate");


function addRule(ruleData = {}) {

  const clone =
    template.content.cloneNode(true);

  const rule =
    clone.querySelector(".rule");


  rule.querySelector(
    ".fromContains"
  ).value =
    ruleData.fromContains || "";


  rule.querySelector(
    ".fromNotContains"
  ).value =
    ruleData.fromNotContains || "";


  rule.querySelector(
    ".toContains"
  ).value =
    ruleData.toContains || "";


  rule.querySelector(
    ".toNotContains"
  ).value =
    ruleData.toNotContains || "";


  rule.querySelector(
    ".subjectContains"
  ).value =
    ruleData.subjectContains || "";


  rule.querySelector(
    ".subjectNotContains"
  ).value =
    ruleData.subjectNotContains || "";


  rule.querySelector(
    ".messageContains"
  ).value =
    ruleData.messageContains || "";


  rule.querySelector(
    ".messageNotContains"
  ).value =
    ruleData.messageNotContains || "";


  const actions =
    ruleData.actions || {};


  rule.querySelector(
    '[data-action="archive"]'
  ).checked =
    Boolean(actions.archive);


  rule.querySelector(
    '[data-action="read"]'
  ).checked =
    Boolean(actions.read);


  rule.querySelector(
    '[data-action="star"]'
  ).checked =
    Boolean(actions.star);


  rule.querySelector(
    '[data-action="delete"]'
  ).checked =
    Boolean(actions.delete);


  rule.querySelector(
    '[data-action="neverSpam"]'
  ).checked =
    Boolean(actions.neverSpam);


  rule.querySelector(
    '[data-action="important"]'
  ).checked =
    Boolean(actions.important);


  rule.querySelector(
    '[data-action="notImportant"]'
  ).checked =
    Boolean(actions.notImportant);


  rule.querySelector(
    ".label"
  ).value =
    ruleData.label || "";


  rule.querySelector(
    ".forward"
  ).value =
    ruleData.forward || "";


  rule.querySelector(
    ".category"
  ).value =
    ruleData.category || "";


  rule.querySelector(
    ".delete-rule"
  ).addEventListener(
    "click",
    () => {
      rule.remove();
    }
  );


  rulesContainer.appendChild(clone);
}


function collectRules() {

  const rules = [];


  document
    .querySelectorAll(".rule")
    .forEach((rule) => {

      const get = (selector) => {

        return rule
          .querySelector(selector)
          .value
          .trim();

      };


      const actions = {

        archive:
          rule.querySelector(
            '[data-action="archive"]'
          ).checked,

        read:
          rule.querySelector(
            '[data-action="read"]'
          ).checked,

        star:
          rule.querySelector(
            '[data-action="star"]'
          ).checked,

        delete:
          rule.querySelector(
            '[data-action="delete"]'
          ).checked,

        neverSpam:
          rule.querySelector(
            '[data-action="neverSpam"]'
          ).checked,

        important:
          rule.querySelector(
            '[data-action="important"]'
          ).checked,

        notImportant:
          rule.querySelector(
            '[data-action="notImportant"]'
          ).checked

      };


      rules.push({

        fromContains:
          get(".fromContains"),

        fromNotContains:
          get(".fromNotContains"),

        toContains:
          get(".toContains"),

        toNotContains:
          get(".toNotContains"),

        subjectContains:
          get(".subjectContains"),

        subjectNotContains:
          get(".subjectNotContains"),

        messageContains:
          get(".messageContains"),

        messageNotContains:
          get(".messageNotContains"),

        label:
          get(".label"),

        forward:
          get(".forward"),

        category:
          rule.querySelector(
            ".category"
          ).value,

        actions

      });

    });


  return rules;
}


function loadRules() {

  chrome.storage.local.get(
    ["rules"],
    (data) => {

      rulesContainer.innerHTML = "";

      const rules =
        data.rules || [];

      rules.forEach(
        (rule) => {
          addRule(rule);
        }
      );

    }
  );
}


addRuleButton.addEventListener(
  "click",
  () => {
    addRule();
  }
);


saveButton.addEventListener(
  "click",
  () => {

    const rules =
      collectRules();


    chrome.storage.local.set(
      {
        rules: rules,
        filterCount: rules.length
      },
      () => {

        saveStatus.textContent =
          "Rules saved!";

        setTimeout(
          () => {
            saveStatus.textContent = "";
          },
          2500
        );

      }
    );

  }
);


loadRules();