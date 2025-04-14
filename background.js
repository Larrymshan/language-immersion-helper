// Translation cache
const translationCache = {};

// Default settings
const defaultSettings = {
  enabled: true,
  languageMode: "random", // "random" or "fixed"
  languages: {
    spanish: true,
    german: true,
    french: true
  },
  targetLanguage: "spanish", // Used in fixed mode
  density: "medium",
  maxWords: "3"
};

// Initialize settings when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  // Load existing settings or set defaults
  chrome.storage.local.get(defaultSettings, (items) => {
    // Save the merged settings back
    chrome.storage.local.set(items);
    console.log("Extension installed/updated. Settings initialized:", items);
  });
});

// Listen for translation requests from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translate") {
    handleTranslateRequest(request, sender, sendResponse);
    return true; // Keep the message channel open for async response
  } 
  else if (request.action === "getPageTranslations") {
    handleGetPageTranslations(request, sender, sendResponse);
    return true; // Keep the message channel open for async response
  } 
  else if (request.action === "settingsUpdated") {
    handleSettingsUpdated(request, sendResponse);
    return true; // Keep the message channel open for async response
  }
});

// Handle translation requests
async function handleTranslateRequest(request, sender, sendResponse) {
  const { text, targetLanguage, sourceLanguage = 'en', preferredSource } = request;
  
  try {
    // Check cache first
    const cacheKey = `${sourceLanguage}:${targetLanguage}:${text}`;
    if (translationCache[cacheKey]) {
      sendResponse({ 
        translation: translationCache[cacheKey], 
        source: "cache" 
      });
      return;
    }
    
    // Check if preferredSource is specified
    if (preferredSource === "localized") {
      try {
        // Try localized version first
        const localizedResult = await checkLocalizedVersion(sender.tab.url, targetLanguage, text);
        if (localizedResult && localizedResult.translation) {
          // Cache the result
          translationCache[cacheKey] = localizedResult.translation;
          sendResponse({ 
            translation: localizedResult.translation, 
            source: "localized",
            url: localizedResult.url
          });
          return;
        }
      } catch (error) {
        console.error("Error checking localized version:", error);
        // Fall through to API translation
      }
    }
    
    // Use API translation
    const apiResult = await translateWithAPI(text, sourceLanguage, targetLanguage);
    // Cache the result
    translationCache[cacheKey] = apiResult.translation;
    sendResponse({ 
      translation: apiResult.translation, 
      source: "api"
    });
  } catch (error) {
    console.error("Translation error:", error);
    sendResponse({ 
      error: "Translation failed", 
      errorDetails: error.toString() 
    });
  }
}

// Handle localized page translation requests
async function handleGetPageTranslations(request, sender, sendResponse) {
  try {
    const results = await getLocalizedVersions(sender.tab.url, request.targetLanguages);
    sendResponse({ success: true, localizedVersions: results });
  } catch (error) {
    console.error("Error finding localized versions:", error);
    sendResponse({ success: false, error: error.toString() });
  }
}

// Handle settings updates and propagate to all tabs
function handleSettingsUpdated(request, sendResponse) {
  // Save the updated settings
  chrome.storage.local.set(request.settings, () => {
    console.log("Settings updated:", request.settings);
    
    // Notify all tabs about the settings change
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        // Only send to content scripts on http/https pages
        if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
          chrome.tabs.sendMessage(tab.id, {
            action: "settingsUpdated",
            settings: request.settings
          }).catch(error => {
            // Don't worry about errors for inactive tabs
            console.log(`Could not update tab ${tab.id}: ${error}`);
          });
        }
      });
    });
    
    sendResponse({ success: true });
  });
}

// Function to check if a localized version of the page exists and contains the text
async function checkLocalizedVersion(url, targetLanguage, text) {
  try {
    const langCodes = {
      "spanish": "es",
      "german": "de", 
      "french": "fr"
    };
    
    const langCode = langCodes[targetLanguage];
    if (!langCode) {
      throw new Error(`Unsupported language: ${targetLanguage}`);
    }
    
    // Create potential localized URLs
    const urlObj = new URL(url);
    
    // Try common localization patterns
    const localizedUrls = [
      // 1. Language subdomain: es.example.com
      new URL(`${url}`).toString().replace(`${urlObj.hostname}`, `${langCode}.${urlObj.hostname.replace(/^[^.]+\./, '')}`),
      
      // 2. Language in path: example.com/es/
      new URL(`${url}`).toString().replace(`${urlObj.origin}${urlObj.pathname}`, `${urlObj.origin}/${langCode}${urlObj.pathname}`),
      
      // 3. Language in query param: example.com/?lang=es
      `${url}${urlObj.search ? '&' : '?'}lang=${langCode}`
    ];
    
    // Try to fetch each potential localized URL
    for (const localizedUrl of localizedUrls) {
      try {
        const response = await fetch(localizedUrl, { 
          method: 'HEAD',
          // Don't follow redirects
          redirect: 'manual',
          // Small timeout to avoid long waits
          signal: AbortSignal.timeout(2000)
        });
        
        // If the page exists
        if (response.status === 200) {
          // In a real implementation, we would fetch the content and look for the specific text
          // For this example, we'll simulate a found translation
          return {
            translation: `[${targetLanguage} translation from site]`,
            url: localizedUrl,
            source: "localized"
          };
        }
      } catch (e) {
        console.log(`Could not access ${localizedUrl}:`, e);
        // Continue trying other URLs
      }
    }
    
    // No localized version found
    return null;
  } catch (error) {
    console.error("Error checking localized version:", error);
    throw error;
  }
}

// Function to get all available localized versions of a page
async function getLocalizedVersions(url, targetLanguages) {
  const results = {};
  const langCodes = {
    "spanish": "es",
    "german": "de", 
    "french": "fr"
  };
  
  for (const language of targetLanguages) {
    const langCode = langCodes[language];
    if (!langCode) continue;
    
    try {
      const urlObj = new URL(url);
      
      // Check common localization patterns
      const localizedUrls = [
        // 1. Language subdomain: es.example.com
        new URL(`${url}`).toString().replace(`${urlObj.hostname}`, `${langCode}.${urlObj.hostname.replace(/^[^.]+\./, '')}`),
        
        // 2. Language in path: example.com/es/
        new URL(`${url}`).toString().replace(`${urlObj.origin}${urlObj.pathname}`, `${urlObj.origin}/${langCode}${urlObj.pathname}`),
        
        // 3. Language in query param: example.com/?lang=es
        `${url}${urlObj.search ? '&' : '?'}lang=${langCode}`
      ];
      
      for (const localizedUrl of localizedUrls) {
        try {
          const response = await fetch(localizedUrl, { 
            method: 'HEAD',
            redirect: 'manual',
            signal: AbortSignal.timeout(2000)
          });
          
          if (response.status === 200) {
            results[language] = {
              available: true,
              url: localizedUrl
            };
            break;  // Found a working URL for this language
          }
        } catch (e) {
          // Continue checking other URLs
        }
      }
      
      // If no URLs worked for this language
      if (!results[language]) {
        results[language] = {
          available: false
        };
      }
    } catch (error) {
      console.error(`Error checking ${language} version:`, error);
      results[language] = {
        available: false,
        error: error.toString()
      };
    }
  }
  
  return results;
}

// Function to translate text using an external API
async function translateWithAPI(text, sourceLanguage, targetLanguage) {
  // In a real implementation, this would call an actual translation API
  // For this example, we'll return a simulated translation
  
  const languageNames = {
    "spanish": "Spanish",
    "german": "German",
    "french": "French"
  };
  
  // Simple mock translations for demo purposes
  const mockTranslations = {
    "spanish": {
      "Hello": "Hola",
      "World": "Mundo",
      "Welcome": "Bienvenido",
      "Language": "Idioma",
      "Learning": "Aprendizaje",
      "is": "es",
      "fun": "divertido",
      "easy": "fácil",
      "difficult": "difícil"
    },
    "french": {
      "Hello": "Bonjour",
      "World": "Monde",
      "Welcome": "Bienvenue",
      "Language": "Langue",
      "Learning": "Apprentissage",
      "is": "est",
      "fun": "amusant",
      "easy": "facile",
      "difficult": "difficile"
    },
    "german": {
      "Hello": "Hallo",
      "World": "Welt",
      "Welcome": "Willkommen",
      "Language": "Sprache",
      "Learning": "Lernen",
      "is": "ist",
      "fun": "Spaß",
      "easy": "einfach",
      "difficult": "schwierig"
    }
  };
  
  // Use mock translations for basic words or generate a placeholder
  const words = text.split(/\s+/);
  const translatedWords = words.map(word => {
    const cleanWord = word.replace(/[^\w]/g, '');
    return mockTranslations[targetLanguage][cleanWord] || `[${targetLanguage}:${cleanWord}]`;
  });
  
  return {
    translation: translatedWords.join(' '),
    source: "api"
  };
}