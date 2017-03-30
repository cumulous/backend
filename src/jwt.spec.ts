import * as jwt from './jwt';
import { authenticate, getCertificate, verifyJwt,
         parseTokenInfo, parseTokenHeader, parseKid } from './jwt';
import { Callback, Dict } from './types';

const jsrsasign = require('jsrsasign');

describe('parseTokenInfo()', () => {
  const fakeToken = 'ey.ab.cd';

  let spyOnParseJWS: jasmine.Spy;

  beforeEach(() => {
    spyOnParseJWS = spyOn(jsrsasign.jws.JWS, 'parse');
  });

  const testMethod = (callback: Callback) => {
    parseTokenInfo(fakeToken, callback);
  };

  it('calls jsrsasign.jws.JWS.parse() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnParseJWS).toHaveBeenCalledWith(fakeToken);
      expect(spyOnParseJWS).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback with correct parameters upon successful parsing', (done: Callback) => {
    const fakeTokenInfo = () => ({
      headerObj: {
        kid: '1234',
      },
      payloadObj: {
        fake: 'claim',
      },
    });
    spyOnParseJWS.and.returnValue(fakeTokenInfo());
    testMethod((err: Error, tokenInfo: any) => {
      expect(err).toBeFalsy();
      expect(tokenInfo).toEqual(fakeTokenInfo());
      done();
    });
  });

  it('calls callback with an Error if jsrsasign.jws.JWS.parse() throws an Error',
      (done: Callback) => {
    spyOnParseJWS.and.throwError('jsrsasign.jws.JWS.parse()');
    testMethod((err: Error) => {
      expect(err).toEqual(jasmine.any(Error));
      done();
    });
  });
});

describe('parseTokenHeader()', () => {
  const fakeToken = 'ey.ab.cd';

  let fakeTokenHeader: () => Dict<string>;
  let fakeTokenInfo: () => { headerObj: Dict<string> };

  let spyOnParseTokenInfo: jasmine.Spy;

  beforeEach(() => {
    fakeTokenHeader = () => ({
      alg: 'RS256',
    });
    fakeTokenInfo = () => ({
      headerObj: fakeTokenHeader(),
    });

    spyOnParseTokenInfo = spyOn(jwt, 'parseTokenInfo')
      .and.callFake((token: string, callback: Callback) =>
        callback ? callback(null, fakeTokenInfo()) : null);
  });

  const testMethod = (callback: Callback) => {
    parseTokenHeader(fakeToken, callback);
  };

  it('calls parseTokenInfo() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnParseTokenInfo).toHaveBeenCalledWith(fakeToken, jasmine.any(Function));
      expect(spyOnParseTokenInfo).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback with correct parameters', (done: Callback) => {
    testMethod((err: Error, header: any) => {
      expect(err).toBeFalsy();
      expect(header).toEqual(fakeTokenHeader());
      done();
    });
  });

  describe('calls callback with an error if', () => {
    const testError = (done: Callback) => {
      testMethod((err: Error) => {
        expect(err).toEqual(jasmine.any(Error));
        done();
      });
    };
    it('parseTokenInfo() returns an error', (done: Callback) => {
      spyOnParseTokenInfo.and.callFake((token: string, callback: Callback) =>
        callback ? callback(Error('parseTokenInfo()')) : null);
      testError(done);
    });
    describe('parseTokenInfo() returns', () => {
      let tokenInfo: any;
      afterEach((done: Callback) => {
        spyOnParseTokenInfo.and.callFake((token: string, callback: Callback) =>
          callback ? callback(null, tokenInfo) : null);
        testError(done);
      })
      it('undefined object', () => tokenInfo = undefined);
      it('null object', () => tokenInfo = null);
    });
  });
});

describe('parseKid()', () => {
  const fakeToken = 'ey.ab.cd';
  const fakeCertId = 'FAKE_CERT_ID'

  let spyOnParseTokenHeader: jasmine.Spy;

  beforeEach(() => {
    spyOnParseTokenHeader = spyOn(jwt, 'parseTokenHeader');
  });

  const testMethod = (callback: Callback) => {
    parseKid(fakeToken, callback);
  };

  it('calls parseTokenHeader() with correct parameters', (done: Callback) => {
    spyOnParseTokenHeader.and.callFake((token: string, callback: Callback) =>
      callback ? callback() : null);
    testMethod(() => {
      expect(spyOnParseTokenHeader).toHaveBeenCalledWith(fakeToken, jasmine.any(Function));
      expect(spyOnParseTokenHeader).toHaveBeenCalledTimes(1);
      done();
    });
  });

  describe('calls callback with correct parameters if header contains', () => {
    let fakeHeader: { kid?: string, x5t?: string };
    afterEach((done: Callback) => {
      spyOnParseTokenHeader.and.callFake((token: string, callback: Callback) =>
        callback ? callback(null, fakeHeader) : null);
      testMethod((err: Error, certId: any) => {
        expect(err).toBeFalsy();
        expect(certId).toEqual(fakeCertId);
        done();
      });
    });
    it('"kid"', () => fakeHeader = { kid: fakeCertId });
    it('"x5t"', () => fakeHeader = { x5t: fakeCertId });
  });

  it('calls callback with an error if parseTokenHeader() returns an error', (done: Callback) => {
    spyOnParseTokenHeader.and.callFake((token: string, callback: Callback) =>
      callback ? callback(Error('parseTokenHeader()')) : null);
    testMethod((err: Error) => {
      expect(err).toEqual(jasmine.any(Error));
      done();
    });
  });
});

describe('getCertificate()', () => {
  const fakeDomain = 'example.auth0.com';
  const fakeKid = 'FAKE_KEY_ID';
  const fakeKey = 'FAKE_KEY';

  let spyOnGetSigningKey: jasmine.Spy;
  let spyOnJwksClient: jasmine.Spy;

  beforeEach(() => {
    spyOnGetSigningKey = jasmine.createSpy('getSigningKey')
      .and.callFake((kid: string, callback: Callback) =>
        callback ? callback(null, { publicKey: fakeKey }) : null);
    spyOnJwksClient = spyOn(jwt, 'jwksClient')
      .and.returnValue({ getSigningKey: spyOnGetSigningKey });
  });

  const testMethod = (callback: Callback) => {
    getCertificate(fakeDomain, fakeKid, callback);
  };

  it('calls jwksClient() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnJwksClient).toHaveBeenCalledWith({
        jwksUri: `https://${fakeDomain}/.well-known/jwks.json`,
        cache: true,
        rateLimit: true,
      });
      expect(spyOnJwksClient).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls JwksClient.getSigningKey() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnGetSigningKey).toHaveBeenCalledWith(fakeKid, jasmine.any(Function));
      expect(spyOnGetSigningKey).toHaveBeenCalledTimes(1);
      done();
    });
  });

  describe('calls callback with correct parameters ' +
           'if JwksClient.getSigningKey() response contains', () => {
    let keyResponse: any;
    afterEach((done: Callback) => {
      spyOnGetSigningKey.and.callFake((kid: string, callback: Callback) =>
        callback ? callback(null, keyResponse) : null);
      testMethod((err: Error, key: string) => {
        expect(err).toBeFalsy();
        expect(key).toEqual(fakeKey);
        done();
      });
    });
    it('publicKey', () => keyResponse = { publicKey: fakeKey });
    it('rsaPublicKey', () => keyResponse = { rsaPublicKey: fakeKey });
  });

  it('calls callback immediately with an error if jwksClient() throws an error', (done: Callback) => {
    spyOnJwksClient.and.throwError('jwksClient()');
    testMethod((err: Error) => {
      expect(err).toEqual(jasmine.any(Error));
      done();
    });
  });

  describe('calls callback with an error if JwksClient.getSigningKey() produces', () => {
    afterEach((done: Callback) => {
      testMethod((err: Error) => {
        expect(err).toEqual(jasmine.any(Error));
        done();
      });
    });
    it('an error', () => {
      spyOnGetSigningKey.and.callFake((kid: string, callback: Callback) =>
          callback ? callback(Error('JwksClient.getSigningKey()')) : null);
    });
    it('an undefined response', () => {
      spyOnGetSigningKey.and.callFake((kid: string, callback: Callback) =>
          callback ? callback(null, undefined) : null);
    });
    it('a null response', () => {
      spyOnGetSigningKey.and.callFake((kid: string, callback: Callback) =>
          callback ? callback(null, null) : null);
    });
  });
});

describe('verifyJwt()', () => {
  const fakeToken = 'ey.ab.cd';
  const fakeCert = 'FAKE_CERT ABCD';

  let spyOnVerifyJWT: jasmine.Spy;

  beforeEach(() => {
    spyOnVerifyJWT = spyOn(jsrsasign.jws.JWS, 'verifyJWT')
      .and.returnValue(true);
  });

  const testMethod = (callback: Callback) => {
    verifyJwt(fakeToken, fakeCert, callback);
  };

  it('calls jsrsasign.jws.JWS.verifyJWT() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnVerifyJWT).toHaveBeenCalledWith(
        fakeToken, fakeCert, { alg: ['RS256'] });
      expect(spyOnVerifyJWT).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback without an Error if jsrsasign.jws.JWS.verifyJwt() returns "true"',
      (done: Callback) => {
    testMethod((err: Error) => {
      expect(err).toBeFalsy();
      done();
    });
  });

  describe('calls callback with an Error if jsrsasign.jws.JWS.verifyJwt()', () => {
    const testError = (done: Callback) => {
      testMethod((err: Error) => {
        expect(err).toBeTruthy();
        done();
      });
    };
    it('returns "false"', (done: Callback) => {
      spyOnVerifyJWT.and.returnValue(false);
      testError(done);
    });
    it('throws an Error', (done: Callback) => {
      spyOnVerifyJWT.and.throwError('verifyJwt()');
      testError(done);
    });
  });
});

describe('authenticate()', () => {
  const fakeDomain = 'tenant.auth0.com';
  const fakeToken = 'ey.ab.cd';
  const fakeKid = 'FAKE_KID';
  const fakeCert = 'FAKE_CERT ABCD';

  let spyOnParseKid: jasmine.Spy;
  let spyOnGetCertificate: jasmine.Spy;
  let spyOnVerifyJwt: jasmine.Spy;

  beforeEach(() => {
    spyOnParseKid = spyOn(jwt, 'parseKid')
      .and.callFake((token: string, callback: Callback) =>
        callback ? callback(null, fakeKid) : null);
    spyOnGetCertificate = spyOn(jwt, 'getCertificate')
      .and.callFake((domain: string, kid: string, callback: Callback) =>
        callback ? callback(null, fakeCert) : null);
    spyOnVerifyJwt = spyOn(jwt, 'verifyJwt')
      .and.callFake((token: string, cert: string, callback: Callback) =>
        callback ? callback(): null);
  });

  const testMethod = (callback: Callback) => {
    authenticate(fakeDomain, fakeToken, callback);
  };

  it('calls parseKid() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnParseKid).toHaveBeenCalledWith(fakeToken, jasmine.any(Function));
      expect(spyOnParseKid).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls getCertificate() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnGetCertificate).toHaveBeenCalledWith(fakeDomain, fakeKid, jasmine.any(Function));
      expect(spyOnGetCertificate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls verifyJwt() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnVerifyJwt).toHaveBeenCalledWith(
        fakeToken, fakeCert, jasmine.any(Function));
      expect(spyOnVerifyJwt).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback without an error if JWT is valid', (done: Callback) => {
    testMethod((err: Error) => {
      expect(err).toBeFalsy();
      done();
    });
  });

  it('immediately calls callback "Unauthorized" response if parseKid() returns an error',
      (done: Callback) => {
    spyOnParseKid.and.callFake((token: string, callback: Callback) =>
      callback ? callback(Error('parseKid()')) : null);
    testMethod((err: string) => {
      expect(err).toEqual('Unauthorized');
      expect(spyOnGetCertificate).not.toHaveBeenCalled();
      done();
    });
  });

  it('immediately calls callback with an Error if getCertificate() returns an error',
      (done: Callback) => {
    spyOnGetCertificate.and.callFake((domain: string, kid: string, callback: Callback) =>
      callback ? callback(Error('getCertificate()')) : null);
    testMethod((err: Error) => {
      expect(err).toEqual(jasmine.any(Error));
      expect(spyOnVerifyJwt).not.toHaveBeenCalled();
      done();
    });
  });

  it('calls callback with "Unauthorized" response if verifyJwt() returns an Error',
      (done: Callback) => {
    spyOnVerifyJwt.and.callFake((token: string, cert: string, callback: Callback) =>
        callback ? callback(Error('verifyJwt()')): null);
    testMethod((err: string) => {
      expect(err).toEqual('Unauthorized');
      done();
    });
  });
});
