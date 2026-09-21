// Dedicated portfolio App Check registration, using reCAPTCHA Enterprise.
// Public activation approved on 3 September 2026. Set disconnected for a closed-state rollback.
// These are public SDK settings, not Google OAuth credentials or Calendar tokens.
export const bookingConfig=Object.freeze({
 mode:'production',
 apiBaseUrl:'https://crm.elyshaworks.com',
 appCheckSiteKey:'6LcXU6UtAAAAAM17HknLXDs-fD_Ha8jWLtk6tCI-',
 firebaseConfig:Object.freeze({
  projectId:'elyshaworks-fd2dc',
  appId:'1:281424869871:web:5eaa548ffb80404d03de1a',
  apiKey:'AIzaSyAm-Eakep2fUwoGLzyQOz98pXXKd1zZ4xY',
  authDomain:'elyshaworks-fd2dc.firebaseapp.com'
 })
});
export function runtimeConfig(){const local=typeof location!=='undefined'&&['127.0.0.1','localhost'].includes(location.hostname);return local&&globalThis.__ELY_BOOKING_TEST_CONFIG__?globalThis.__ELY_BOOKING_TEST_CONFIG__:bookingConfig;}
