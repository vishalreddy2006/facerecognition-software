// Environment Configuration
// This file determines which backend API URL to use

const ENV = {
  // Production backend URL (Update this after deploying to Render)
  PRODUCTION_API: 'https://your-app-name.onrender.com/api',
  
  // Development backend URL
  DEVELOPMENT_API: 'http://localhost:3000/api',
  
  // Auto-detect environment
  getApiUrl() {
    // If running on localhost, use development API
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return this.DEVELOPMENT_API;
    }
    // Otherwise use production API
    return this.PRODUCTION_API;
  }
};

// Export for use in other scripts
window.ENV = ENV;
