import Service, { inject as service } from '@ember/service';
import { addQueryParam, addQueryParams, popupWindowOptions } from 'shared/utils/util';
import { get, set } from '@ember/object';
import C from 'shared/utils/constants';

export default Service.extend({
  access:      service(),
  cookies:     service(),
  session:     service(),
  globalStore: service(),
  app:         service(),
  intl:        service(),

  generateState() {
    return set(this, 'session.zoomlionState', `${ Math.random() }`);
  },

  stateMatches(actual) {
    return actual && get(this, 'session.zoomlionState') === actual;
  },

  testConfig(config) {
    return config.doAction('configureTest', config);
  },

  saveConfig(config, opt) {
    return config.doAction('testAndApply', opt);
  },

  authorize(auth, state) {
    const url = addQueryParams(get(auth, 'redirectUrl'), {
      scope:         'read:org',
      redirect_uri:  `${ window.location.origin }/verify-auth`,
      response_type: 'code',
      authProvider:  'zoomlion',
      state,
    });

    return window.location.href = url;
  },

  login(forwardUrl) {
    const provider     = get(this, 'access.providers').findBy('id', 'zoomlion');
    const authRedirect = get(provider, 'redirectUrl');
    let   redirect     = `${ window.location.origin }/verify-auth`;

    if ( forwardUrl ) {
      redirect = addQueryParam(redirect, 'forward', forwardUrl);
    }

    const url = addQueryParams(authRedirect, {
      scope:         'read:org',
      redirect_uri:  redirect,
      response_type: 'code',
      state:         this.generateState(),
    });

    window.location.href = url;
  },

  test(config, cb) {
    let responded = false;

    window.onAuthTest = (err, code) => {
      if ( !responded ) {
        let ghConfig = config;

        responded = true;

        this.finishTest(ghConfig, code, cb);
      }
    };

    set(this, 'state', this.generateState());

    let url = addQueryParams(`${ window.location.origin }/verify-auth`, { config: 'zoomlion', });

    const popup = window.open(url, 'rancherAuth', popupWindowOptions());
    const intl = get(this, 'intl');

    let timer = setInterval(() => {
      if (popup && popup.closed ) {
        clearInterval(timer);

        if ( !responded ) {
          responded = true;
          cb({
            type:    'error',
            message: intl.t('authPage.zoomlion.testAuth.authError')
          });
        }
      } else if (popup === null || typeof (popup) === 'undefined') {
        clearInterval(timer);

        if ( !responded ) {
          responded = true;

          cb({
            type:    'error',
            message: intl.t('authPage.zoomlion.testAuth.popupError')
          });
        }
      }
    }, 500);
  },

  finishTest(config, code, cb) {
    const ghConfig = config;

    set(ghConfig, 'enabled', true);

    let out = {
      code,
      enabled:        true,
      zoomlionConfig: ghConfig,
      description:    C.SESSION.DESCRIPTION,
      ttl:            C.SESSION.TTL,
    };

    const allowedPrincipalIds = get(config, 'allowedPrincipalIds') || [];

    return this.saveConfig(config, out).then(() => {
      let found = false;
      const myPIds = get(this, 'access.me.principalIds');

      myPIds.forEach( (id) => {
        if (allowedPrincipalIds.indexOf(id) >= 0) {
          found = true;
        }
      });

      if ( !found && !allowedPrincipalIds.length) {
        allowedPrincipalIds.pushObject(get(this, 'access.principal.id'));
      }

      return ghConfig.save().then(() => {
        window.location.href = window.location.href;
      });
    })
      .catch((err) => {
        cb(err);
      });
  },
});
