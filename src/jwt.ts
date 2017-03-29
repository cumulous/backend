const jsrsasign = require('jsrsasign');

export const verifyJwt =  jsrsasign.jws.JWS.verifyJWT;
