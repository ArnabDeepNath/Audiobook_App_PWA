// Resource checker script
console.log("Resource checker started");

// List of resources to check
const resourcesToCheck = [
  'manifest.json',
  'main.dart.js',
  'flutter_service_worker.js',
  'favicon.png',
  'icons/Icon-192.png',
  'icons/Icon-512.png',
  'icons/Icon-maskable-192.png',
  'icons/Icon-maskable-512.png',
  'splash/img/branding-dark-2x.png',
  'splash/img/branding-1x.png'
];

// Check each resource
function checkResources() {
  resourcesToCheck.forEach(resource => {
    fetch(resource)
      .then(response => {
        if (response.ok) {
          console.log(`✅ Resource loaded successfully: ${resource}`);
        } else {
          console.error(`❌ Failed to load resource: ${resource} (status: ${response.status})`);
        }
      })
      .catch(error => {
        console.error(`❌ Error loading resource: ${resource}`, error);
      });
  });
}

// Run the check when the script loads
checkResources();
