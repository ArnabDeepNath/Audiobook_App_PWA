// web/audio_stream_integration.js

// Base URL for the streaming service
const BASE_URL = 'https://audiostream.backendservices.in';
const API_KEY = 'GK_DdKoT6EJPozXRpjh6avwKmQSpwIoqsuY';
const STORAGE_KEY = 'last_audio_url';
const POSITION_KEY = 'last_position';

// Initialize HLS.js if needed
function initializeHls() {
  if (window.Hls === undefined) {
    // Load HLS.js dynamically if not already available
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
    script.async = true;
    document.head.appendChild(script);
    
    // Return a promise that resolves when HLS.js is loaded
    return new Promise((resolve) => {
      script.onload = () => {
        console.log('HLS.js loaded successfully');
        resolve(true);
      };
      script.onerror = () => {
        console.error('Failed to load HLS.js');
        resolve(false);
      };
    });
  }
  
  // HLS.js is already available
  return Promise.resolve(true);
}

// Upload an audio file to the streaming server
async function uploadAudioFile(file) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('audio', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', BASE_URL + '/upload');
    xhr.setRequestHeader('api-key', API_KEY);

    // Report progress to Flutter
    xhr.upload.onprogress = function(event) {
      if (event.lengthComputable) {
        const percentComplete = (event.loaded / event.total) * 100;
        // Send progress to Flutter
        if (window.flutter_inappwebview) {
          window.flutter_inappwebview.callHandler('uploadProgress', percentComplete);
        }
      }
    };

    xhr.onload = function() {
      if (xhr.status === 200) {
        try {
          const json = JSON.parse(xhr.responseText);
          console.log('Server Response:', json);
          if (json.audiopath) {
            const streamUrl = BASE_URL + json.audiopath;
            localStorage.setItem(STORAGE_KEY, streamUrl);
            resolve(streamUrl);
          } else {
            reject(new Error('Unexpected server response'));
          }
        } catch (e) {
          reject(new Error('Invalid server response'));
        }
      } else {
        reject(new Error(`Upload failed with status: ${xhr.status}`));
      }
    };

    xhr.onerror = function() {
      reject(new Error('Network error during upload'));
    };

    xhr.send(formData);
  });
}

// Check if a streaming URL is ready
async function checkStreamingUrl(url) {
  return new Promise((resolve, reject) => {
    const maxAttempts = 6; // 30 seconds if checked every 5s
    let attempts = 0;

    const checkReady = async () => {
      try {
        const res = await fetch(url, { method: 'HEAD' });
        if (res.ok) {
          resolve(true);
        } else {
          throw new Error('Not ready');
        }
      } catch (error) {
        if (++attempts < maxAttempts) {
          setTimeout(checkReady, 5000);
        } else {
          reject(new Error('Stream not available after maximum attempts'));
        }
      }
    };

    checkReady();
  });
}

// Play audio using HLS.js or native browser support
async function playAudio(streamUrl, elementId = 'audio-player') {
  const player = document.getElementById(elementId);
  
  if (!player) {
    console.error(`Audio player element with ID '${elementId}' not found`);
    return false;
  }

  try {
    // Make sure HLS.js is available
    const hlsAvailable = await initializeHls();
    
    if (hlsAvailable && window.Hls.isSupported()) {
      const hls = new window.Hls();
      hls.loadSource(streamUrl);
      hls.attachMedia(player);
      hls.on(window.Hls.Events.MANIFEST_PARSED, function() {
        player.play();
      });
      
      // Report success to Flutter
      return true;
    } else if (player.canPlayType('application/vnd.apple.mpegurl')) {
      player.src = streamUrl;
      player.addEventListener('loadedmetadata', function() {
        player.play();
      });
      
      // Report success to Flutter
      return true;
    } else {
      console.error("HLS not supported in this browser");
      return false;
    }
  } catch (error) {
    console.error('Error playing audio:', error);
    return false;
  }
}

// Stream audio directly from API URL
async function streamAudioFromApi(apiUrl, elementId = 'audio-player') {
  console.log('streamAudioFromApi called with URL:', apiUrl);
  
  // First, validate the URL
  try {
    new URL(apiUrl);
  } catch (e) {
    console.error('Invalid URL provided:', apiUrl);
    return false;
  }
  
  // Find or create the audio element
  let player = document.getElementById(elementId);
  
  if (!player) {
    console.log(`Audio player element with ID '${elementId}' not found, creating it...`);
    player = document.createElement('audio');
    player.id = elementId;
    player.style.display = 'none';
    document.body.appendChild(player);
  }
  
  try {
    // Check if we can reach the URL
    const isAccessible = await verifyApiUrl(apiUrl);
    if (!isAccessible) {
      console.error('URL is not accessible:', apiUrl);
      return false;
    }
    console.log('URL is accessible, continuing with playback');
    
    // Make sure HLS.js is available if needed
    const hlsAvailable = await initializeHls();
    console.log('HLS available:', hlsAvailable);
    
    // Check if URL is HLS stream
    const isHls = apiUrl.includes('.m3u8');
    console.log('Is HLS stream:', isHls);
    
    // For debugging - log audio capabilities
    console.log('Audio format support:');
    console.log('- MP3:', player.canPlayType('audio/mpeg'));
    console.log('- AAC:', player.canPlayType('audio/aac'));
    console.log('- HLS:', player.canPlayType('application/vnd.apple.mpegurl'));
    
    if (isHls && hlsAvailable && window.Hls.isSupported()) {
      console.log('Using HLS.js for streaming');
      
      // Clean up any existing HLS instance
      if (window._currentHls) {
        window._currentHls.destroy();
      }
      
      const hls = new window.Hls({
        debug: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
        maxBufferSize: 60 * 1000 * 1000, // 60MB
      });
      
      window._currentHls = hls;
      
      // Add error handling
      hls.on(window.Hls.Events.ERROR, function(event, data) {
        console.error('HLS error:', event, data);
        if (data.fatal) {
          switch(data.type) {
            case window.Hls.ErrorTypes.NETWORK_ERROR:
              console.error('Fatal network error encountered, trying to recover');
              hls.startLoad();
              break;
            case window.Hls.ErrorTypes.MEDIA_ERROR:
              console.error('Fatal media error encountered, trying to recover');
              hls.recoverMediaError();
              break;
            default:
              console.error('Fatal error, cannot recover');
              hls.destroy();
              break;
          }
        }
      });
      
      // Load source and attach to player
      hls.loadSource(apiUrl);
      hls.attachMedia(player);
      hls.on(window.Hls.Events.MANIFEST_PARSED, function() {
        console.log('Manifest parsed, attempting to play');
        player.play()
          .then(() => {
            console.log('Playback started successfully');
            // Report playback state to Flutter
            if (window.flutter_inappwebview) {
              window.flutter_inappwebview.callHandler('playbackStateChanged', true);
            }
          })
          .catch(error => {
            console.error('Failed to start playback:', error);
            if (window.flutter_inappwebview) {
              window.flutter_inappwebview.callHandler('playbackStateChanged', false);
            }
          });
      });
      
      player.addEventListener('error', function(e) {
        console.error('Player error:', e);
      });
      
      // Handle playback state changes
      player.addEventListener('play', () => {
        if (window.flutter_inappwebview) {
          window.flutter_inappwebview.callHandler('playbackStateChanged', true);
        }
      });
      
      player.addEventListener('pause', () => {
        if (window.flutter_inappwebview) {
          window.flutter_inappwebview.callHandler('playbackStateChanged', false);
        }
      });
      
      return true;
    } else {
      // Direct streaming for MP3 or other supported formats
      console.log('Using native audio player for streaming');
      
      // Set CORS attribute
      player.crossOrigin = 'anonymous';
      
      // Load the audio source
      player.src = apiUrl;
      
      // Add more event listeners for debugging
      player.addEventListener('loadstart', () => console.log('Audio loadstart event'));
      player.addEventListener('durationchange', () => console.log('Audio duration:', player.duration));
      player.addEventListener('loadedmetadata', () => console.log('Audio loadedmetadata event'));
      player.addEventListener('canplay', () => console.log('Audio canplay event'));
      player.addEventListener('error', (e) => console.error('Audio error event:', player.error));
      
      try {
        console.log('Attempting to play audio...');
        const playPromise = player.play();
        
        if (playPromise !== undefined) {
          await playPromise;
          console.log('Playback started successfully');
          
          // Report playback state to Flutter
          if (window.flutter_inappwebview) {
            window.flutter_inappwebview.callHandler('playbackStateChanged', true);
          }
          
          return true;
        } else {
          console.warn('Play promise was undefined');
          return false;
        }
      } catch (error) {
        console.error('Failed to start playback:', error);
        
        // Try a different approach for browsers that block autoplay
        console.log('Trying alternate approach - setting volume to 0');
        player.volume = 0;
        
        try {
          await player.play();
          console.log('Silent playback started, now setting volume back');
          setTimeout(() => {
            player.volume = 1.0;
            if (window.flutter_inappwebview) {
              window.flutter_inappwebview.callHandler('playbackStateChanged', true);
            }
          }, 500);
          return true;
        } catch (err2) {
          console.error('Alternative approach also failed:', err2);
          if (window.flutter_inappwebview) {
            window.flutter_inappwebview.callHandler('playbackStateChanged', false);
          }
          return false;
        }
      }
    }
  } catch (error) {
    console.error('Error streaming audio:', error);
    return false;
  }
}

// Verify if an API URL is accessible
async function verifyApiUrl(url) {
  console.log('Verifying URL accessibility:', url);
  
  try {
    // Try a direct fetch first (may fail due to CORS)
    try {
      const response = await fetch(url, { 
        method: 'HEAD',
        mode: 'cors',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (response.ok) {
        console.log('URL is directly accessible');
        return true;
      }
      console.warn('URL returned status:', response.status);
    } catch (e) {
      console.warn('Direct fetch failed (likely CORS):', e);
    }
    
    // Create an audio element to test loading
    const testAudio = new Audio();
    
    return new Promise((resolve) => {
      // Set up event handlers
      testAudio.onloadedmetadata = () => {
        console.log('Audio metadata loaded successfully');
        resolve(true);
      };
      
      testAudio.onerror = (e) => {
        console.error('Error loading audio:', e);
        resolve(false);
      };
      
      // Set a timeout in case neither event fires
      const timeout = setTimeout(() => {
        console.warn('Audio load test timed out');
        resolve(false);
      }, 5000);
      
      // Start loading the audio
      testAudio.src = url;
      testAudio.load();
    });
  } catch (e) {
    console.error('Error verifying URL:', e);
    return false;
  }
}

// Save the current playback position
function savePosition(position) {
  localStorage.setItem(POSITION_KEY, position.toString());
}

// Get the saved playback position
function getSavedPosition() {
  const position = localStorage.getItem(POSITION_KEY);
  return position ? parseInt(position, 10) : 0;
}

// Clear saved audio data
function clearAudioData() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(POSITION_KEY);
  
  const player = document.getElementById('audio-player');
  if (player) {
    player.pause();
    player.removeAttribute('src');
    player.load();
  }
  
  return true;
}

// Register JS methods to be called from Flutter
if (window.flutter_inappwebview) {
  window.flutter_inappwebview.registerHandler('uploadAudio', function(file) {
    return uploadAudioFile(file);
  });
  
  window.flutter_inappwebview.registerHandler('checkStreamUrl', function(url) {
    return checkStreamingUrl(url);
  });
  
  window.flutter_inappwebview.registerHandler('playAudio', function(url, elementId) {
    return playAudio(url, elementId);
  });
  
  window.flutter_inappwebview.registerHandler('streamAudioFromApi', function(url, elementId) {
    return streamAudioFromApi(url, elementId);
  });
  
  window.flutter_inappwebview.registerHandler('createBlobUrlAndPlay', function(url, elementId) {
    return createBlobUrlAndPlay(url, elementId);
  });
  
  window.flutter_inappwebview.registerHandler('downloadAndUploadToStreamingService', function(url, fileName) {
    return downloadAndUploadToStreamingService(url, fileName);
  });
  
  window.flutter_inappwebview.registerHandler('savePosition', function(position) {
    savePosition(position);
    return true;
  });
  
  window.flutter_inappwebview.registerHandler('getSavedPosition', function() {
    return getSavedPosition();
  });
  
  window.flutter_inappwebview.registerHandler('clearAudioData', function() {
    return clearAudioData();
  });
}

// Create a blob URL from a direct download link and play it
async function createBlobUrlAndPlay(url, elementId = 'audio-player') {
  console.log('Creating blob URL for direct download file:', url);
  
  // First check if browser supports audio playback and log detailed results
  const audioTestResult = testAudioSupport();
  console.log('Browser audio support test results:', JSON.stringify(audioTestResult));
  
  // More specific format detection based on URL
  let audioFormat = 'unknown';
  if (url.toLowerCase().endsWith('.mp3')) {
    audioFormat = 'mp3';
  } else if (url.toLowerCase().endsWith('.m4a') || url.toLowerCase().endsWith('.mp4')) {
    audioFormat = 'mp4';
  } else if (url.toLowerCase().endsWith('.wav')) {
    audioFormat = 'wav';
  } else if (url.toLowerCase().endsWith('.ogg')) {
    audioFormat = 'ogg';
  } else if (url.toLowerCase().includes('.m3u8')) {
    audioFormat = 'hls';
  }
  
  console.log(`Detected audio format: ${audioFormat}`);
  console.log(`Browser support for this format: ${audioTestResult[audioFormat]}`);
  
  // Find or create the audio element
  let player = document.getElementById(elementId);
  
  if (!player) {
    console.log(`Audio player element with ID '${elementId}' not found, creating it...`);
    player = document.createElement('audio');
    player.id = elementId;
    player.style.display = 'none';
    player.crossOrigin = 'anonymous'; // Add CORS attribute to help with CORS issues
    player.preload = 'auto';          // Ensure we preload the audio
    document.body.appendChild(player);
  }
  
  // Add more detailed error handling
  player.onerror = function(e) {
    console.error('Audio element error:', player.error);
    console.error('Error code:', player.error ? player.error.code : 'unknown');
    console.error('Error message:', player.error ? player.error.message : 'unknown');
    
    // Log detailed media error diagnosis
    if (player.error) {
      switch(player.error.code) {
        case 1:
          console.error('MEDIA_ERR_ABORTED: The user aborted the fetching of the audio.');
          break;
        case 2:
          console.error('MEDIA_ERR_NETWORK: A network error occurred while fetching the audio.');
          break;
        case 3:
          console.error('MEDIA_ERR_DECODE: A decoding error occurred. This often happens with unsupported codecs or formats.');
          break;
        case 4:
          console.error('MEDIA_ERR_SRC_NOT_SUPPORTED: The audio format or MIME type is not supported by the browser.');
          break;
        default:
          console.error('Unknown media error.');
      }
    }
  };
  
  // Verify internet connectivity first
  if (!navigator.onLine) {
    console.error('No internet connection detected.');
    return false;
  }
  
  try {
    // Fetch the file as a blob with proper error handling
    console.log('Fetching file as blob...');
    
    let response;
    try {
      // First try with CORS mode
      response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
        headers: {
          'Origin': window.location.origin
        }
      });
    } catch (fetchError) {
      console.error('Fetch error (likely CORS):', fetchError);
      
      try {
        // Try with no-cors as fallback
        console.log('Retrying with no-cors mode...');
        response = await fetch(url, {
          method: 'GET',
          mode: 'no-cors',
          cache: 'no-cache'
        });
        
        // If we get here without error but with opaque response, we need to try direct playback
        if (response.type === 'opaque') {
          console.log('Received opaque response, attempting direct playback...');
          player.src = url;
          try {
            await player.play();
            console.log('Direct playback successful');
            
            // Report playback state to Flutter
            if (window.flutter_inappwebview) {
              window.flutter_inappwebview.callHandler('playbackStateChanged', true);
            }
            
            return true;
          } catch (directPlayError) {
            console.error('Direct playback failed:', directPlayError);
            
            // Try audio source fallbacks (adding query params can help bypass cache issues)
            console.log('Attempting with query parameter...');
            player.src = url + '?t=' + new Date().getTime();
            
            try {
              await player.play();
              console.log('Fallback playback successful');
              
              if (window.flutter_inappwebview) {
                window.flutter_inappwebview.callHandler('playbackStateChanged', true);
              }
              
              return true;
            } catch (fallbackError) {
              console.error('All playback attempts failed:', fallbackError);
              return false;
            }
          }
        }
      } catch (noCorsError) {
        console.error('No-cors fetch also failed:', noCorsError);
        
        // Last resort: direct playback
        console.log('Attempting direct playback as last resort...');
        player.src = url;
        try {
          await player.play();
          console.log('Direct playback successful');
          
          if (window.flutter_inappwebview) {
            window.flutter_inappwebview.callHandler('playbackStateChanged', true);
          }
          
          return true;
        } catch (directPlayError) {
          console.error('Direct playback failed:', directPlayError);
          return false;
        }
      }
    }
    
    if (!response.ok && response.type !== 'opaque') {
      console.error('Failed to fetch the file:', response.status, response.statusText);
      return false;
    }
    
    // Get the blob from the response (only for CORS mode)
    let fileBlob;
    try {
      fileBlob = await response.blob();
      console.log('File fetched successfully, size:', fileBlob.size, 'type:', fileBlob.type);
      
      // Try to determine proper MIME type if not detected correctly
      let mimeType = fileBlob.type;
      if (!mimeType || mimeType === 'application/octet-stream') {
        console.log('MIME type not detected correctly, attempting to determine from URL');
        const lowercaseUrl = url.toLowerCase();
        if (lowercaseUrl.endsWith('.mp3')) {
          mimeType = 'audio/mpeg';
        } else if (lowercaseUrl.endsWith('.m4a') || lowercaseUrl.endsWith('.mp4')) {
          mimeType = 'audio/mp4';
        } else if (lowercaseUrl.endsWith('.wav')) {
          mimeType = 'audio/wav';
        } else if (lowercaseUrl.endsWith('.ogg')) {
          mimeType = 'audio/ogg';
        } else {
          // Default to MP3 as a common audio format
          mimeType = 'audio/mpeg';
        }
        console.log('Using MIME type:', mimeType);
        
        // Create a new blob with the correct MIME type
        fileBlob = new Blob([fileBlob], { type: mimeType });
      }
    } catch (blobError) {
      console.error('Error getting blob from response:', blobError);
      
      // Try direct playback as fallback
      console.log('Attempting direct playback after blob error...');
      player.src = url;
      try {
        await player.play();
        console.log('Direct playback successful after blob error');
        
        if (window.flutter_inappwebview) {
          window.flutter_inappwebview.callHandler('playbackStateChanged', true);
        }
        
        return true;
      } catch (directPlayError) {
        console.error('Direct playback failed after blob error:', directPlayError);
        return false;
      }
    }
    
    // Create a blob URL
    const blobUrl = URL.createObjectURL(fileBlob);
    console.log('Created blob URL:', blobUrl, 'with MIME type:', fileBlob.type);
    
    // Set the audio source to the blob URL
    player.src = blobUrl;
    
    // Add event listeners for debugging
    player.addEventListener('loadstart', () => console.log('Blob audio loadstart event'));
    player.addEventListener('durationchange', () => console.log('Blob audio duration:', player.duration));
    player.addEventListener('loadedmetadata', () => console.log('Blob audio loadedmetadata event'));
    player.addEventListener('canplay', () => console.log('Blob audio canplay event'));
    
    // Handle cleanup when the audio is no longer needed
    player.onended = function() {
      URL.revokeObjectURL(blobUrl);
      console.log('Blob URL revoked after playback ended');
    };
    
    // Play the audio
    try {
      console.log('Attempting to play blob audio...');
      await player.play();
      console.log('Blob audio playback started successfully');
      
      // Report playback state to Flutter
      if (window.flutter_inappwebview) {
        window.flutter_inappwebview.callHandler('playbackStateChanged', true);
      }
      
      return true;
    } catch (playError) {
      console.error('Failed to play blob audio:', playError);
      
      // Try the silent approach (often helps with autoplay restrictions)
      console.log('Trying silent autoplay approach...');
      player.volume = 0;
      try {
        await player.play();
        console.log('Silent blob playback started, now setting volume back');
        setTimeout(() => {
          player.volume = 1.0;
          if (window.flutter_inappwebview) {
            window.flutter_inappwebview.callHandler('playbackStateChanged', true);
          }
        }, 500);
        return true;
      } catch (err2) {
        console.error('Alternative blob approach also failed:', err2);
        if (window.flutter_inappwebview) {
          window.flutter_inappwebview.callHandler('playbackStateChanged', false);
        }
        return false;
      }
    }
  } catch (error) {
    console.error('Error creating or playing blob URL:', error);
    return false;
  }
}

// Download a file from direct URL and upload to streaming service
async function downloadAndUploadToStreamingService(url, fileName) {
  console.log('Downloading file from direct URL for streaming service upload:', url);
  
  try {
    // Show progress in UI
    if (window.flutter_inappwebview) {
      window.flutter_inappwebview.callHandler('uploadProgress', 10);
    }
    
    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      console.error('Invalid URL provided:', url);
      return null;
    }
    
    console.log('URL validation passed:', url);
    console.log('File name will be:', fileName);
    
    // Test server connectivity first
    try {
      console.log('Testing API server connectivity...');
      const testResponse = await fetch(`${BASE_URL}/ping`, {
        method: 'GET',
        headers: {
          'api-key': API_KEY
        }
      });
      
      const testResult = await testResponse.text();
      console.log('API server connectivity test result:', testResult);
      
      if (!testResponse.ok) {
        console.error('API server connectivity test failed:', testResponse.status);
      }
    } catch (testError) {
      console.error('API server connectivity test error:', testError);
      // Continue anyway, the main request might still work
    }
    
    // 1. Fetch the file as a blob with proper error handling and progress reporting
    console.log('Fetching file as blob...');
    
    // Use XMLHttpRequest for better progress tracking
    const fileBlob = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.responseType = 'blob';
      
      // Set timeout
      xhr.timeout = 60000; // 60 seconds
      
      // Track download progress
      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          // Map download progress to 10-50% of total progress
          const downloadProgress = 10 + (event.loaded / event.total) * 40;
          console.log(`Download progress: ${Math.round(downloadProgress)}%`);
          if (window.flutter_inappwebview) {
            window.flutter_inappwebview.callHandler('uploadProgress', downloadProgress);
          }
        }
      };
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          console.log('File downloaded successfully, size:', xhr.response.size);
          resolve(xhr.response);
        } else {
          console.error(`HTTP error! Status: ${xhr.status}`);
          reject(new Error(`HTTP error! Status: ${xhr.status}`));
        }
      };
      
      xhr.onerror = (e) => {
        console.error('Network error occurred during download:', e);
        reject(new Error('Network error occurred'));
      };
      
      xhr.ontimeout = () => {
        console.error('Request timed out');
        reject(new Error('Request timed out'));
      };
      
      xhr.send();
    });
    
    console.log('File fetched successfully, size:', fileBlob.size, 'type:', fileBlob.type);
    
    // Set progress to 50% after successful download
    if (window.flutter_inappwebview) {
      window.flutter_inappwebview.callHandler('uploadProgress', 50);
    }
    
    // 2. Process the file - create a File object with proper MIME type detection
    let mimeType = fileBlob.type;
    
    // If the server didn't provide a MIME type or it's incorrect, try to determine it from the URL or filename
    if (!mimeType || mimeType === 'application/octet-stream') {
      if (url.toLowerCase().endsWith('.wav') || (fileName && fileName.toLowerCase().endsWith('.wav'))) {
        mimeType = 'audio/wav';
      } else if (url.toLowerCase().endsWith('.mp3') || (fileName && fileName.toLowerCase().endsWith('.mp3'))) {
        mimeType = 'audio/mpeg';
      } else if (url.toLowerCase().endsWith('.m4a') || (fileName && fileName.toLowerCase().endsWith('.m4a'))) {
        mimeType = 'audio/mp4';
      }
    }
    
    // Ensure we have a filename with proper extension
    let finalFileName = fileName || 'audio_file';
    if (!finalFileName.includes('.')) {
      // Add extension based on mime type
      if (mimeType === 'audio/wav') {
        finalFileName += '.wav';
      } else if (mimeType === 'audio/mpeg') {
        finalFileName += '.mp3';
      } else if (mimeType === 'audio/mp4') {
        finalFileName += '.m4a';
      } else {
        finalFileName += '.wav'; // Default to .wav if unknown
      }
    }
    
    // Create a File object from the blob
    const fileObj = new File([fileBlob], finalFileName, { 
      type: mimeType || 'audio/wav' 
    });
    
    console.log(`Prepared file object: name=${finalFileName}, type=${mimeType}, size=${fileObj.size}`);
    
    // 3. Upload the file to the streaming service with progress tracking
    console.log('Uploading file to streaming service...');
    console.log('Target URL:', BASE_URL + '/upload');
    console.log('File object:', fileObj.name, fileObj.type, fileObj.size, 'bytes');
    
    const streamingUrl = await new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('audio', fileObj);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', BASE_URL + '/upload');
      xhr.setRequestHeader('api-key', API_KEY);
      
      // Set timeout
      xhr.timeout = 120000; // 2 minutes
      
      // Log all headers for debugging
      console.log('Request headers:');
      console.log('- api-key:', API_KEY ? 'Set (value hidden)' : 'Not set');

      // Report upload progress to Flutter
      xhr.upload.onprogress = function(event) {
        if (event.lengthComputable) {
          // Map upload progress to 50-95% of total progress
          const uploadProgress = 50 + (event.loaded / event.total) * 45;
          console.log(`Upload progress: ${Math.round(uploadProgress)}%`);
          if (window.flutter_inappwebview) {
            window.flutter_inappwebview.callHandler('uploadProgress', uploadProgress);
          }
        }
      };

      xhr.onload = function() {
        console.log('Upload complete, status:', xhr.status);
        if (xhr.status === 200) {
          try {
            console.log('Raw server response:', xhr.responseText);
            const json = JSON.parse(xhr.responseText);
            console.log('Parsed server response:', json);
            
            if (json.audiopath) {
              const streamUrl = BASE_URL + json.audiopath;
              console.log('Generated streaming URL:', streamUrl);
              
              // Store in localStorage for future use
              localStorage.setItem(STORAGE_KEY, streamUrl);
              
              // Store specific key for this file
              const fileKey = "audiobook_url_" + fileName;
              localStorage.setItem(fileKey, streamUrl);
              console.log('Stored streaming URL in localStorage with key:', fileKey);
              
              resolve(streamUrl);
            } else {
              console.error('Missing audiopath in server response');
              reject(new Error('Unexpected server response - no audiopath found'));
            }
          } catch (e) {
            console.error('Error parsing server response:', e);
            console.error('Raw response:', xhr.responseText);
            reject(new Error('Invalid server response format'));
          }
        } else {
          console.error('Upload failed with status:', xhr.status, xhr.statusText);
          console.error('Response text:', xhr.responseText);
          reject(new Error(`Upload failed with status: ${xhr.status} - ${xhr.statusText}`));
        }
      };

      xhr.onerror = function(e) {
        console.error('Network error during upload:', e);
        reject(new Error('Network error during upload'));
      };
      
      xhr.ontimeout = function() {
        console.error('Upload request timed out');
        reject(new Error('Upload request timed out'));
      };

      try {
        xhr.send(formData);
        console.log('Upload request sent successfully');
      } catch (sendError) {
        console.error('Error sending upload request:', sendError);
        reject(sendError);
      }
    });
    
    console.log('File uploaded successfully, got streaming URL:', streamingUrl);
    
    // Set progress to 100% on completion
    if (window.flutter_inappwebview) {
      window.flutter_inappwebview.callHandler('uploadProgress', 100);
    }
    
    // Verify the streaming URL is ready before returning
    let isReady = false;
    let attempts = 0;
    const maxAttempts = 5;
    
    while (!isReady && attempts < maxAttempts) {
      try {
        isReady = await checkStreamingUrl(streamingUrl);
        if (isReady) break;
      } catch (e) {
        console.log(`Attempt ${attempts+1}/${maxAttempts} to verify stream failed:`, e);
      }
      
      attempts++;
      
      // Wait 2 seconds between attempts
      if (!isReady && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    if (!isReady) {
      console.warn('Stream URL could not be verified, but returning it anyway');
    }
    
    return streamingUrl;
  } catch (error) {
    console.error('Error in download and upload process:', error);
    
    // Notify Flutter of the error
    if (window.flutter_inappwebview) {
      window.flutter_inappwebview.callHandler('uploadProgress', 0); // Reset progress on error
    }
    
    return null;
  }
}

// Process an external audio URL
// This function will be called from audio-bridge.html with a URL parameter
function processExternalUrl(url) {
  console.log('Processing external URL:', url);
  
  // Get references to the necessary elements
  const player = document.getElementById('audio-player');
  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  
  // Show progress container
  progressContainer.style.display = 'block';
  progressBar.style.width = '10%';
  progressText.textContent = 'Fetching audio from URL...';
  
  // Create a new XMLHttpRequest to fetch the audio
  const xhr = new XMLHttpRequest();
  xhr.open('POST', BASE_URL + '/process-external');
  
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('api-key', API_KEY);
  
  xhr.upload.onprogress = function(event) {
    if (event.lengthComputable) {
      const percentComplete = (event.loaded / event.total) * 100;
      progressBar.style.width = `${percentComplete}%`;
      progressText.textContent = `Processing audio: ${Math.round(percentComplete)}%`;
      
      // Trigger custom event for progress
      updateProgress(percentComplete);
    }
  };
  
  xhr.onload = function() {
    if (xhr.status === 200) {
      progressBar.style.width = '100%';
      progressText.textContent = 'Processing complete!';
      
      try {
        const json = JSON.parse(xhr.responseText);
        console.log('Server Response:', json);
        
        if (json.audiopath) {
          const streamUrl = BASE_URL + json.audiopath;
          localStorage.setItem(STORAGE_KEY, streamUrl);
          
          // Try to play the audio
          waitUntilReady(streamUrl);
        } else {
          progressText.textContent = 'Unexpected server response.';
          console.error('Unexpected server response:', json);
        }
      } catch (e) {
        progressText.textContent = 'Error parsing server response.';
        console.error('Error parsing server response:', e);
      }
    } else {
      progressText.textContent = `Failed with status: ${xhr.status}`;
      console.error('Request failed with status:', xhr.status);
    }
  };
  
  xhr.onerror = function() {
    progressText.textContent = 'Network error';
    console.error('Network error occurred');
  };
  
  const data = JSON.stringify({
    url: url
  });
  
  xhr.send(data);
}

// Bridge functions for communication with Dart
function processAudioUrlFromDart(audioUrl, callback) {
  processAudioUrl(audioUrl)
    .then(streamUrl => {
      // If we have audio element in the DOM, use it
      const audioElement = document.getElementById('audioPlayer');
      if (audioElement) {
        playAudioStream(streamUrl, audioElement);
      }
      callback(true, 'Audio processed successfully', streamUrl);
    })
    .catch(error => {
      console.error('Error processing audio:', error);
      callback(false, error.message || 'Unknown error processing audio');
    });
}

function playAudioFromDart(audioUrl, callback) {
  const audioElement = document.getElementById('audioPlayer');
  if (!audioElement) {
    // Create an audio element if it doesn't exist
    const audio = document.createElement('audio');
    audio.id = 'audioPlayer';
    audio.controls = true;
    audio.style.display = 'none';
    document.body.appendChild(audio);
    
    audio.addEventListener('error', () => {
      callback(false, 'Error loading audio');
    });
    
    audio.addEventListener('loadedmetadata', () => {
      callback(true, 'Audio loaded successfully');
    });
    
    audio.src = audioUrl;
    audio.play();
  } else {
    audioElement.src = audioUrl;
    audioElement.play();
    callback(true, 'Playing audio');
  }
}

// Expose methods to window for direct calling if needed
window.audioStreamAPI = {
  uploadAudioFile,
  checkStreamingUrl,
  playAudio,
  streamAudioFromApi,
  savePosition,
  getSavedPosition,
  clearAudioData,
  createBlobUrlAndPlay,
  downloadAndUploadToStreamingService
};

// Initialize when DOM is loaded
// Test audio support in current browser
function testAudioSupport() {
  const audio = document.createElement('audio');
  return {
    mp3: audio.canPlayType('audio/mpeg') || 'unknown',
    mp4: audio.canPlayType('audio/mp4') || 'unknown',
    wav: audio.canPlayType('audio/wav') || 'unknown',
    aac: audio.canPlayType('audio/aac') || 'unknown',
    ogg: audio.canPlayType('audio/ogg') || 'unknown',
    webm: audio.canPlayType('audio/webm') || 'unknown',
    hls: audio.canPlayType('application/vnd.apple.mpegurl') || 'unknown'
  };
}

window.addEventListener('DOMContentLoaded', () => {
  // Add HLS.js script if not present
  if (typeof Hls === 'undefined') {
    console.log('Loading HLS.js script');
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
    script.async = true;
    document.head.appendChild(script);
  }
  
  // Check for existing audio in localStorage
  const lastUrl = localStorage.getItem(STORAGE_KEY);
  if (lastUrl) {
    console.log('Found previously saved audio URL:', lastUrl);
    // Notify Flutter that we have a saved URL
    if (window.flutter_inappwebview) {
      window.flutter_inappwebview.callHandler('savedAudioFound', lastUrl);
    }
  }
  
  // Test and log audio support
  const supportResults = testAudioSupport();
  console.log('Browser audio format support:', supportResults);
  
  // Create hidden audio element if it doesn't exist
  if (!document.getElementById('audio-player')) {
    const audioElement = document.createElement('audio');
    audioElement.id = 'audio-player';
    audioElement.style.display = 'none';
    audioElement.crossOrigin = 'anonymous';
    audioElement.controls = true; // Enable controls for debugging
    document.body.appendChild(audioElement);
    console.log('Created audio player element');
  }
});
