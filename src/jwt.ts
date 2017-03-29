import { httpsRequest } from './helpers';
import { Callback, Dict } from './types';

const jsrsasign = require('jsrsasign');

export const getCertificate = (domain: string, callback: Callback) => {
  httpsRequest('GET', `https://${domain}/cer`, null, null, callback);
};

export const parseTokenInfo = (token: string, callback: Callback) => {
  try {
    callback(null, jsrsasign.jws.JWS.parse(token));
  } catch (err) {
    callback(err);
  }
};

export const parseTokenHeader = (token: string, callback: Callback) => {
  parseTokenInfo(token, (err: Error, tokenInfo: { headerObj: Dict<string> }) => {
    if (err) {
      callback(err);
    } else if (tokenInfo == null) {
      callback(Error('Unable to parse token info'));
    } else {
      callback(null, tokenInfo.headerObj);
    }
  });
};

export const parseCertId = (token: string, callback: Callback) => {
  parseTokenHeader(token, (err: Error, tokenHeader: { kid?: string, x5t?: string }) => {
    if (err) {
      callback(err);
    } else if (tokenHeader == null) {
      callback(Error('Unable to parse token header'));
    } else {
      callback(null, tokenHeader.kid || tokenHeader.x5t);
    }
  });
};

export const verifyJwt = (token: string, cert: string, callback: Callback) => {
  try {
    const isValid = jsrsasign.jws.JWS.verifyJWT(token, cert, { alg: ['RS256'] });
    callback(isValid ? null : Error('Invalid token'));
  } catch (err) {
    callback(err);
  }
};

export const authenticate = (domain: string, token: string, callback: Callback) => {

  getCertificate(domain, (certErr: Error, cert: string) => {
    if (certErr) return callback(certErr);

    verifyJwt(token, cert, (tokenErr: Error) =>
      callback(tokenErr ? 'Unauthorized' : null));
  });
};
