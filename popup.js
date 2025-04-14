document.addEventListener('DOMContentLoaded', function() {
  // Default settings if none are stored
  const defaultSettings = {
    enabled: true,
    languageMode: "random", // "random" or "fixed"
    languages: {
      spanish: true,
      german: false,
      french: false
    },
    targetLanguage: "spanish", // Used in fixed mode
    density: "medium",
    maxWords: "3"
  };

  // Restore settings from chrome.storage.local
  chrome.storage.local.get(defaultSettings, function(items) {
    console.log("Loaded settings:", items);
    document.getElementById("enabled").checked = items.enabled;
    
    // Set language mode toggle (checkbox checked = fixed mode)
    const modeSwitch = document.getElementById("languageMode");
    modeSwitch.checked = (items.languageMode === "fixed");
    document.getElementById("languageModeLabel").textContent = (items.languageMode === "fixed") ? "Fixed" : "Random";
    
    // Show fixed language selection if mode is fixed, otherwise show language checkboxes
    const fixedSection = document.getElementById("fixedLanguageSection");
    const languageCheckboxes = document.getElementById("languageCheckboxes");
    if (items.languageMode === "fixed") {
      fixedSection.style.display = "block";
      languageCheckboxes.style.display = "none";
      document.getElementById("targetLanguage").value = items.targetLanguage;
    } else {
      fixedSection.style.display = "none";
      languageCheckboxes.style.display = "block";
    }
    
    // Set density and maxWords values
    document.getElementById("density").value = items.density;
    document.getElementById("maxWords").value = items.maxWords;
    
    // Set language checkboxes
    document.getElementById("spanish").checked = items.languages.spanish;
    document.getElementById("german").checked = items.languages.german;
    document.getElementById("french").checked = items.languages.french;
  });

  // Toggle fixed language UI elements when the mode switch changes
  document.getElementById("languageMode").addEventListener("change", function() {
    const fixedSection = document.getElementById("fixedLanguageSection");
    const languageCheckboxes = document.getElementById("languageCheckboxes");
    if (this.checked) {
      fixedSection.style.display = "block";
      languageCheckboxes.style.display = "none";
      document.getElementById("languageModeLabel").textContent = "Fixed";
      console.log("Language mode set to Fixed");
    } else {
      fixedSection.style.display = "none";
      languageCheckboxes.style.display = "block";
      document.getElementById("languageModeLabel").textContent = "Random";
      console.log("Language mode set to Random");
    }
  });

  // Save settings when the user clicks the Apply button
  document.getElementById("apply").addEventListener("click", function() {
    const newSettings = {
      enabled: document.getElementById("enabled").checked,
      languageMode: document.getElementById("languageMode").checked ? "fixed" : "random",
      languages: {
        spanish: document.getElementById("spanish").checked,
        german: document.getElementById("german").checked,
        french: document.getElementById("french").checked
      },
      targetLanguage: document.getElementById("targetLanguage").value,
      density: document.getElementById("density").value,
      maxWords: document.getElementById("maxWords").value
    };

    console.log("Saving new settings:", newSettings);
    
    // Save settings to chrome.storage.local
    chrome.storage.local.set(newSettings, function() {
      console.log("Settings saved successfully.");
      
      // Notify content scripts about the settings change
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "settingsUpdated", 
            settings: newSettings
          });
        }
      });
      
      window.close(); // Close the popup after saving
    });
  });
});