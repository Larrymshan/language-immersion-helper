// Settings with default values
let settings = {
  enabled: false,
  languageMode: "random", // "random" or "fixed"
  languages: {
    spanish: true,
    german: true,
    french: true
  },
  targetLanguage: "spanish", // Used in fixed mode
  density: 'medium',
  maxWords: '3'
};

// Store information about available localized versions
let localizedVersions = {};

// Load settings when the script runs
function initializeSettings() {
  chrome.storage.local.get(settings, function(items) {
    settings = items;
    console.log("Settings loaded:", settings);
    
    if (settings.enabled) {
      setTimeout(initializeExtension, 1000); // Wait for page to fully load
    }
  });
}

// Initialize when document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSettings);
} else {
  initializeSettings();
}

// Listen for settings changes
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "settingsUpdated") {
    console.log("Settings update received:", request.settings);
    settings = request.settings;
    
    // If enabled, refresh translations
    if (settings.enabled) {
      // Remove existing translations
      const translatedElements = document.querySelectorAll('.translated-word');
      translatedElements.forEach(el => {
        const originalText = el.getAttribute('data-original');
        if (originalText) {
          el.outerHTML = originalText;
        }
      });
      
      // Apply new translations
      setTimeout(initializeExtension, 100);
    } else {
      // Remove all translations
      const translatedElements = document.querySelectorAll('.translated-word');
      translatedElements.forEach(el => {
        const originalText = el.getAttribute('data-original');
        if (originalText) {
          el.outerHTML = originalText;
        }
      });
    }
    
    // Send response back to confirm receipt
    if (sendResponse) {
      sendResponse({success: true});
    }
  }
});

// Initialize the extension
async function initializeExtension() {
  if (!settings.enabled) return;
  
  try {
    // Get available languages based on settings and language mode
    let availableLanguages = [];
    
    if (settings.languageMode === "fixed") {
      // In fixed mode, only use the selected target language
      if (settings.targetLanguage) {
        availableLanguages.push(settings.targetLanguage);
      }
    } else {
      // In random mode, use all selected languages
      if (settings.languages.spanish) availableLanguages.push('spanish');
      if (settings.languages.german) availableLanguages.push('german');
      if (settings.languages.french) availableLanguages.push('french');
    }
    
    // If no languages are selected, exit
    if (availableLanguages.length === 0) {
      console.log("No languages selected, exiting");
      return;
    }
    
    console.log("Available languages:", availableLanguages);
    
    // Check for localized versions of the page
    await checkForLocalizedVersions(availableLanguages);
    
    // Process the page and add translations
    processPage(availableLanguages);
  } catch (error) {
    console.error("Error initializing extension:", error);
  }
}

// Check for localized versions of the page
async function checkForLocalizedVersions(languages) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: "getPageTranslations",
      targetLanguages: languages
    }, response => {
      if (response && response.success) {
        localizedVersions = response.localizedVersions;
        console.log("Got localized versions:", localizedVersions);
        resolve(localizedVersions);
      } else {
        console.error("Failed to get localized versions:", response?.error);
        reject(new Error("Failed to get localized versions"));
      }
    });
  });
}

// Process the page and add translations
function processPage(availableLanguages) {
  // Get all text nodes that are not in script or style tags



  const textNodes = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // Ignore script, style tags and existing translated words
        if (!node.parentElement || 
            node.parentElement.tagName === 'SCRIPT' || 
            node.parentElement.tagName === 'STYLE' || 
            node.parentElement.tagName === 'NOSCRIPT' ||
            node.parentElement.tagName === 'A' ||
            node.parentElement.tagName === 'BUTTON' ||
            node.parentElement.tagName === 'INPUT' ||
            node.parentElement.tagName === 'CODE' ||
            node.parentElement.tagName === 'PRE' ||
            node.parentElement.closest('a') ||
            node.parentElement.classList.contains('translated-word') ||
            node.parentElement.classList.contains('translation-popup')) {
          return NodeFilter.FILTER_REJECT;
        }
        
        // Only process nodes with actual text content
        if (node.textContent.trim() === '') {
          return NodeFilter.FILTER_REJECT;
        }
        
        // Prioritize nodes in the left part of the page
        const rect = node.parentElement.getBoundingClientRect();
        const pageWidth = window.innerWidth;
        const positionX = rect.left;
        
        // Higher probability for elements in left 40% of the page
        const leftBias = (positionX < pageWidth * 0.4) ? 1.5 : 1.0;
        
        // Apply the bias
        if (Math.random() < leftBias) {
          return NodeFilter.FILTER_ACCEPT;
        }
        
        return NodeFilter.FILTER_SKIP;
      }
    }
  );
  
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }
  
  // Determine density percentage based on settings
  let densityPercentage;
  switch(settings.density) {
    case 'low':
      densityPercentage = Math.random() * 1 + 1; // 1-2%
      break;
    case 'medium':
      densityPercentage = Math.random() * 2 + 3; // 3-5%
      break;
    case 'high':
      densityPercentage = Math.random() * 2 + 6; // 6-8%
      break;
    default:
      densityPercentage = 3;
  }
  
  // Determine total words and how many to translate
  const totalWords = textNodes.reduce((count, node) => 
    count + node.textContent.split(/\s+/).filter(word => word.trim().length > 0).length, 0);
  
  const wordsToTranslate = Math.ceil(totalWords * (densityPercentage / 100));
  
  // Create array of word positions to translate, favoring the left side
  const translationPositions = [];
  let wordCount = 0;
  
  textNodes.forEach(node => {
    const words = node.textContent.split(/\s+/);
    wordCount += words.length;
  });
  
  // Select random positions based on density
  for (let i = 0; i < wordsToTranslate; i++) {
    // Give higher probability to earlier positions (left side of page)
    const position = Math.floor(Math.pow(Math.random(), 1.5) * wordCount);
    translationPositions.push(position);
  }
  
  translationPositions.sort((a, b) => a - b);
  
  // Process each text node
  let currentPosition = 0;
  for (const node of textNodes) {
    processTextNode(node, translationPositions, currentPosition, availableLanguages);
    // Update current position for the next node
    currentPosition += node.textContent.split(/\s+/).filter(word => word.trim().length > 0).length;
  }
}

// Process a single text node
function processTextNode(node, translationPositions, startPosition, availableLanguages) {
  const text = node.textContent;
  const words = text.split(/(\s+)/); // Split by whitespace but keep the separators
  
  let newHTML = '';
  let i = 0;
  let currentPosition = startPosition;
  
  while (i < words.length) {
    // Skip whitespace elements
    if (words[i].trim() === '') {
      newHTML += words[i];
      i++;
      continue;
    }
    
    // Check if current position should be translated
    if (translationPositions.includes(currentPosition)) {
      // Determine how many words to translate (1-3 based on settings)
      const maxWordsToTranslate = Math.min(
        parseInt(settings.maxWords), 
        Math.floor((words.length - i) / 2) + 1
      );
      
      const wordsToTranslate = Math.floor(Math.random() * maxWordsToTranslate) + 1;
      
      // Combine words to translate
      let originalPhrase = words[i].trim();
      let j = 1;
      for (; j < wordsToTranslate * 2 && i + j < words.length; j += 2) {
        if (words[i + j].trim() === '' && i + j + 1 < words.length) {
          originalPhrase += ' ' + words[i + j + 1].trim();
        }
      }
      
      // Select language based on mode
      let language;
      if (settings.languageMode === "fixed") {
        // Fixed mode - use the target language
        language = settings.targetLanguage;
      } else {
        // Random mode - pick a random language
        language = availableLanguages[Math.floor(Math.random() * availableLanguages.length)];
      }
      
      // Determine source (localized or API)
      const translationSource = localizedVersions[language]?.available ? "localized" : "api";
      
      // Create the translated element placeholder
      const translatedPhrase = `[${language}]`;
      
      newHTML += `<span class="translated-word" 
                      data-original="${words.slice(i, i + j).join('')}" 
                      data-translation="${translatedPhrase}" 
                      data-language="${language}"
                      data-source="${translationSource}">${translatedPhrase}</span>`;
      
      i += j;
    } else {
      newHTML += words[i];
      i++;
    }
    
    currentPosition++;
  }
  
  // Replace the text node with our modified HTML if changes were made
  if (newHTML !== text) {
    const tempElement = document.createElement('span');
    tempElement.innerHTML = newHTML;
    
    node.parentNode.replaceChild(tempElement, node);
    
    // Move contents outside the temporary span
    while (tempElement.firstChild) {
      tempElement.parentNode.insertBefore(tempElement.firstChild, tempElement);
    }
    
    // Remove the empty temporary span
    tempElement.parentNode.removeChild(tempElement);
    
    // Add click handler to all translated words
    document.querySelectorAll('.translated-word').forEach(el => {
      if (!el.onclick) {
        el.onclick = handleTranslatedWordClick;
      }
    });
  }
}

// Function to handle clicks on translated words
function handleTranslatedWordClick(event) {
  event.stopPropagation();
  
  // Remove any existing popups
  const existingPopups = document.querySelectorAll('.translation-popup');
  existingPopups.forEach(popup => popup.remove());
  
  const element = this;
  
  // Create popup
  const popup = document.createElement('div');
  popup.className = 'translation-popup';
  
  const original = document.createElement('div');
  original.className = 'original';
  original.textContent = `English: ${element.getAttribute('data-original')}`;
  popup.appendChild(original);
  
  const language = element.getAttribute('data-language');
  const langDisplay = language.charAt(0).toUpperCase() + language.slice(1);
  
  const translated = document.createElement('div');
  translated.textContent = `${langDisplay}: ${element.getAttribute('data-translation')}`;
  popup.appendChild(translated);
  
  // Add source information
  const sourceType = element.getAttribute('data-source');
  const source = document.createElement('div');
  source.className = 'translation-source';
  
  if (sourceType === "localized") {
    const localizedUrl = localizedVersions[language]?.url;
    source.textContent = `From site's ${langDisplay} version`;
    if (localizedUrl) {
      source.innerHTML += ` (<a href="${localizedUrl}" target="_blank">view</a>)`;
    }
  } else {
    source.textContent = "From translation API";
  }
  
  popup.appendChild(source);
  
  // Add pronunciation button
  const playButton = document.createElement('button');
  playButton.className = 'play-button';
  playButton.textContent = '🔊 Pronounce';
  playButton.onclick = function(e) {
    e.stopPropagation();
    const text = element.getAttribute('data-translation');
    speakText(text, language);
  };
  popup.appendChild(playButton);
  
  // Add popup to the word element
  element.appendChild(popup);
  
  // Close popup when clicking outside
  document.addEventListener('click', function closePopup(e) {
    if (!popup.contains(e.target) && e.target !== element) {
      popup.remove();
      document.removeEventListener('click', closePopup);
    }
  });
  
  // Get the actual translation if we don't already have it
  if (element.getAttribute('data-translation') === `[${language}]`) {
    // Get real translation from either localized version or API
    getTranslation(element.getAttribute('data-original'), language, sourceType)
      .then(result => {
        // Update the display
        element.setAttribute('data-translation', result.translation);
        element.textContent = result.translation;
        translated.textContent = `${langDisplay}: ${result.translation}`;
      })
      .catch(error => {
        console.error("Error getting translation:", error);
        translated.textContent = `${langDisplay}: [Translation failed]`;
      });
  }
}

// Function to get translation for a word or phrase
async function getTranslation(text, language, preferredSource) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: "translate",
      text: text,
      targetLanguage: language,
      sourceLanguage: "en",
      preferredSource: preferredSource
    }, response => {
      if (response && response.translation) {
        resolve({
          translation: response.translation,
          source: response.source
        });
      } else {
        reject(new Error(response?.error || "Translation failed"));
      }
    });
  });
}

// Function to speak text using Web Speech API
function speakText(text, language) {
  const speechLang = {
    'spanish': 'es-ES',
    'german': 'de-DE',
    'french': 'fr-FR'
  }[language] || 'en-US';
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = speechLang;
  speechSynthesis.speak(utterance);
}