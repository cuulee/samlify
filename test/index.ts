import esaml2 = require('../index');
import { readFileSync, writeFileSync } from 'fs';
import test from 'ava';
import { assign } from 'lodash';
import xpath from 'xpath';
import { DOMParser as dom } from 'xmldom';
import { xpath as select } from 'xml-crypto';
import * as _ from 'lodash';

const {
  IdentityProvider: identityProvider,
  ServiceProvider: serviceProvider,
  IdPMetadata: idpMetadata,
  SPMetadata: spMetadata,
  Utility: utility,
  SamlLib: libsaml,
  Constants: ref,
} = esaml2;

const getQueryParamByType = libsaml.getQueryParamByType;
const binding = ref.namespace.binding;
const algorithms = ref.algorithms;
const wording = ref.wording;
const signatureAlgorithms = algorithms.signature;

// Define of metadata
const _spKeyFolder = './test/key/sp/';
const _spPrivPem = String(readFileSync(_spKeyFolder + 'privkey.pem'));
const _spPrivKey = _spKeyFolder + 'nocrypt.pem';
const _spPrivKeyPass = 'VHOSp5RUiBcrsjrcAuXFwU1NKCkGA8px';

const defaultIdpConfig = {
  privateKey: readFileSync('./test/key/idp/privkey.pem'),
  privateKeyPass: 'q9ALNhGT5EhfcRmp8Pg7e9zTQeP2x1bW',
  isAssertionEncrypted: true,
  encPrivateKey: readFileSync('./test/key/idp/encryptKey.pem'),
  encPrivateKeyPass: 'g7hGcRmp8PxT5QeP2q9Ehf1bWe9zTALN',
  metadata: readFileSync('./test/misc/idpmeta.xml'),
};

const defaultSpConfig = {
  privateKey: readFileSync('./test/key/sp/privkey.pem'),
  privateKeyPass: 'VHOSp5RUiBcrsjrcAuXFwU1NKCkGA8px',
  isAssertionEncrypted: true, // for logout purpose
  encPrivateKey: readFileSync('./test/key/sp/encryptKey.pem'),
  encPrivateKeyPass: 'BXFNKpxrsjrCkGA8cAu5wUVHOSpci1RU',
  metadata: readFileSync('./test/misc/spmeta.xml'),
};

// Define an identity provider
const idp = identityProvider(defaultIdpConfig);
const sp = serviceProvider(defaultSpConfig);

// Define metadata
const IdPMetadata = idpMetadata(readFileSync('./test/misc/idpmeta.xml'));
const SPMetadata = spMetadata(readFileSync('./test/misc/spmeta.xml'));
const sampleSignedResponse = readFileSync('./test/misc/response_signed.xml').toString();
const wrongResponse = readFileSync('./test/misc/invalid_response.xml').toString();
const spCertKnownGood = readFileSync('./test/key/sp/knownGoodCert.cer').toString().trim();
const spPemKnownGood = readFileSync('./test/key/sp/knownGoodEncryptKey.pem').toString().trim();

function writer(str) {
  writeFileSync('test.txt', str);
}

// start testing

test('base64 encoding returns encoded string', t => {
  t.is(utility.base64Encode('Hello World'), 'SGVsbG8gV29ybGQ=');
});
test('base64 decoding returns decoded string', t => {
  t.is(utility.base64Decode('SGVsbG8gV29ybGQ='), 'Hello World');
});
test('deflate + base64 encoded', t => {
  t.is(utility.base64Encode(utility.deflateString('Hello World')), '80jNyclXCM8vykkBAA==');
});
test('base64 decoded + inflate', t => {
  t.is(utility.inflateString('80jNyclXCM8vykkBAA=='), 'Hello World');
});
test('parse cer format resulting clean certificate', t => {
  t.is(utility.normalizeCerString(readFileSync('./test/key/sp/cert.cer')), spCertKnownGood);
});
test('normalize pem key returns clean string', t => {
  const ekey = readFileSync('./test/key/sp/encryptKey.pem').toString();
  t.is(utility.normalizePemString(ekey), spPemKnownGood);
});
test('getAssertionConsumerService with one binding', t => {
  const expectedPostLocation = 'https://sp.example.org/sp/sso/post';
  const _sp = serviceProvider({
    privateKeyFile: './test/key/sp/privkey.pem',
    privateKeyFilePass: 'VHOSp5RUiBcrsjrcAuXFwU1NKCkGA8px',
    isAssertionEncrypted: true, // for logout purpose
    encPrivateKeyFile: './test/key/sp/encryptKey.pem',
    encPrivateKeyFilePass: 'BXFNKpxrsjrCkGA8cAu5wUVHOSpci1RU',
    assertionConsumerService: [{
      Binding: binding.post,
      Location: expectedPostLocation,
    }],
    singleLogoutService: [{
      Binding: binding.redirect,
      Location: 'https://sp.example.org/sp/slo',
    }],
  });
  t.is(_sp.entityMeta.getAssertionConsumerService(wording.binding.post), expectedPostLocation);
});
test('getAssertionConsumerService with two bindings', t => {
  const expectedPostLocation = 'https://sp.example.org/sp/sso/post';
  const expectedArtifactLocation = 'https://sp.example.org/sp/sso/artifact';
  const _sp = serviceProvider({
    privateKeyFile: './test/key/sp/privkey.pem',
    privateKeyFilePass: 'VHOSp5RUiBcrsjrcAuXFwU1NKCkGA8px',
    isAssertionEncrypted: true, // for logout purpose
    encPrivateKeyFile: './test/key/sp/encryptKey.pem',
    encPrivateKeyFilePass: 'BXFNKpxrsjrCkGA8cAu5wUVHOSpci1RU',
    assertionConsumerService: [{
      Binding: binding.post,
      Location: expectedPostLocation,
    }, {
      Binding: binding.artifact,
      Location: expectedArtifactLocation,
    }],
    singleLogoutService: [{
      Binding: binding.redirect,
      Location: 'https://sp.example.org/sp/slo',
    }, {
      Binding: binding.post,
      Location: 'https://sp.example.org/sp/slo',
    }],
  });
  t.is(_sp.entityMeta.getAssertionConsumerService(wording.binding.post), expectedPostLocation);
  t.is(_sp.entityMeta.getAssertionConsumerService(wording.binding.artifact), expectedArtifactLocation);
});

// Test suite
(() => {


  const _originRequest: string = String(readFileSync('./test/misc/request.xml'));
  const _originResponse: string = String(readFileSync('./test/misc/response.xml'));

  const _decodedResponse: string = String(readFileSync('./test/misc/response_signed.xml'));
  const _decodedResponseDoc = new dom().parseFromString(_decodedResponse);
  const _decodedResponseSignature = select(_decodedResponseDoc, "/*/*[local-name(.)='Signature']")[0];

  const _decodedRequestSHA1: string = String(readFileSync('./test/misc/signed_request_sha1.xml'));
  const _falseDecodedRequestSHA1: string = String(readFileSync('./test/misc/false_signed_request_sha1.xml'));

  const _decodedRequestSHA256: string = String(readFileSync('./test/misc/signed_request_sha256.xml'));
  const _falseDecodedRequestSHA256: string = String(readFileSync('./test/misc/false_signed_request_sha256.xml'));
  const _decodedRequestDocSHA256 = new dom().parseFromString(_decodedRequestSHA256);
  const _decodedRequestSignatureSHA256 = select(_decodedRequestDocSHA256, "/*/*[local-name(.)='Signature']")[0];

  const _decodedRequestSHA512: string = String(readFileSync('./test/misc/signed_request_sha512.xml'));
  const _falseDecodedRequestSHA512: string = String(readFileSync('./test/misc/false_signed_request_sha512.xml'));
  const _decodedRequestDocSHA512 = new dom().parseFromString(_decodedRequestSHA512);
  const _decodedRequestSignatureSHA512 = select(_decodedRequestDocSHA512, "/*/*[local-name(.)='Signature']")[0];

  const octetString: string = 'SAMLRequest=fVNdj9MwEHxH4j9Yfm%2Fi5PpBrLaotEJUOrioKTzwgoy9oZZiO9ibu%2FLvcXLtKUhHnyzZM7Mzu+tlEKZp+abDkz3A7w4CkrNpbODDw4p23nIngg7cCgOBo+TV5vM9zxPGW+%2FQSdfQEeU2Q4QAHrWzlOx3K%2FrjHSsWbFEzdsfETDE2z5ksVKHqYlHP84WooVBS5lNKvoEPkbeiUYaS0rtHrcB%2FiRVWtCoJRuNRM4QO9jagsBiRLJtO2GKSzY%2F5HZ%2FlfDr7TskuIrUVOIidEFueplq1CZyFaRtIpDNpVT1U4B+1hKQ9tUO5IegHbZW2v25n%2FPkMCvzT8VhOyofqSMnmmnvrbOgM+Iv818P9i4nwrwcFxmVp1IJzb+K9kIGu374hZNm3mQ9R%2Ffp1rgEUSqBYpmPsC7nlfd%2F2u9I1Wv4hH503Av8fKkuy4UarST1AORihm41SHkKI4ZrGPW09CIyzQN8BTce1LmsFaliy2ACEM5KtM63wOvRTiNYlPoe7xhtjt01cmwPU65ubJbnscfG6jMeT8+qS%2FlWpwV96w2BEXN%2FHn2P9Fw%3D%3D&SigAlg=http%3A%2F%2Fwww.w3.org%2F2000%2F09%2Fxmldsig%23rsa-sha1';
  const octetStringSHA256: string = 'SAMLRequest=fZJbTwIxEIX%2Fyqbvy3Yv3BogQYiRBJWw6INvY3eAJt0WO10v%2F966YIKJkPRpek7nfDMdEdT6IKaN35s1vjVIPvqstSHRXoxZ44ywQIqEgRpJeCnK6f1SZB0uDs56K61mZ5brDiBC55U1LFrMx2wrB8P%2BIB%2FGeQHbuOgVwxigB3EqewXfDjDPZJ9Fz%2BgoWMYsvBB8RA0uDHkwPpR42o1THvNswzMRTtHtpEX2wqJ5QFEGfOvce38QSaKtBL235EXOeZoQ2aRUZqexVDvzaEp070pikveG3W5otTrx3ShTBdl1tNejiMTdZrOKV4%2FlhkXTX9yZNdTU6E4dntbLfzIVnGdtJpDEJqOfaYqW1k0ua2v0UIGHUXKuHx3X%2BhBSLuYrq5X8im6tq8Ffhkg7aVtRVbxtpQJrUHpaVQ6JAozW9mPmEDyGzYEmZMnk2PbvB5p8Aw%3D%3D&SigAlg=http%3A%2F%2Fwww.w3.org%2F2001%2F04%2Fxmldsig-more%23rsa-sha256';
  const octetStringSHA512: string = 'SAMLRequest=fZJfT8IwFMW%2FytL3sY5tCA0jQYiRBIUw9MG3a3cnTboWezv%2FfHvr0AQT9fX2nJ7zu%2B2UoNVHMe%2F8wezwuUPy0VurDYn%2BoGSdM8ICKRIGWiThpajmN2sxHHBxdNZbaTU7s%2FzvACJ0XlnDotWyZFBkDcAE47wZjeNcXqTxGAsZy0lR1EUzAiwaFt2jo2ApWbgh%2BIg6XBnyYHwY8bSIUx7z4Z4PRZaLbDLg4%2FyBRcuAogz43nnw%2FiiSRFsJ%2BmDJi4zzNCGySaXMk8ZKPZmNqdC9KIlJNgr5IWr7xXepTB1k%2F6M9nkQkrvf7bbzdVHsWzb9xF9ZQ16L7SrjbrX%2FplHM%2B7DuBJDabfm5T9LRu9re2RQ81eJgm5%2Frp6VlvQ8vVcmu1ku%2FRlXUt%2BL8h0kHaT1QdN71UYAtKz%2BvaIVGA0dq%2BLhyCx5I1oAlZMjvF%2FvxAsw8%3D&SigAlg=http%3A%2F%2Fwww.w3.org%2F2001%2F04%2Fxmldsig-more%23rsa-sha512';
  const signatureB64SHA512: string = 'pLoxKnpOVA1mvLpOZCyzCyB/P01Qcy7cEFskzycm5sdNFYjmZAMGT6yxCgTRvzIloX2J7abZdAkU1dA8kY2yPQrWCuQFOxeSCqnGpHg5/bBKzFiGwWtlyHgh7LXEEo2zKWspJh7BhwRIbtOAnN3XvCPDO58wKHnEdxo9TneTyFmy5hcfYKcF7LlI8jSFkmsPvCsMMJ8TawgnKlwdIU0Ze/cp64Y24cpYxVIKtCC950VRuxAt3bmr7pqtIEsHKkqTOrPv5pWo2XqRG0UhvzjYCbpC8aGOuqLe8hfTfgpQ6ebUkqrgAufkLrinOGpZrlQQDFr0iVIKR30bInDGjg2G+g==';
  const signatureB64SHA256: string = 'iC7RXfHuIu4gBLGABv0qtt96XFvyC7QSX8cDyLjJj+WNOTRMO5J/AYKelVhuc2AZuyGcf/sfeeVmcW7wyKTBHiGS+AWUCljmG43mPWERPfsa7og+GxrsHDSFh5nD70mQF44bXvpo/oVOxHx/lPiDG5LZg2KBccNXqJxMVUhnyU6xeGBctYY5ZQ4y7MGOx7hWTWjHyv+wyFd44Bcq0kpunTls91z03GkYo/Oxd4KllbfR5D2v6awjrc79wMYL1CcZiKZ941ter6tHOHCwtZRhTqV3Dl42zOKUOCyGcjJnVzJre1QBA7hrn3WB5/fu5kE6/E9ENRWp8ZRJLbU8C2Oogg==';
  const signatureB64SHA1: string = 'UKPzYQivZOavFV3QjOH/B9AwKls9n5hZIzOL+V93Yi7lJ7siNkAA9WZgErtFVpDTN6ngSwvlfP/hXZcS33RcCGBWi1SX+xuwuk2U7bZgdkkw4tIH8zcgiRy8bK0IpMoXmLbApU2QsiNwRDMZq3iQdlaMhlsJh85VI+90SQk7fewseiw5Ui6BIpFSH96gLYjWMDPpwk+0GkhkkVaP5vo+I6mBQryD9YPFRu7JfCrnw2T6gldXlGu0IN326+qajKheAGmPSLWBmeFYhquJ5ipgfQGU/KCNIEUr6hkW8NU0+6EVaZl/A9Fyfs1+8KCQ6HxZ7FGyewQjJIx3a8XvBM5vDg==';
  const dummySignRequest: string = 'PHNhbWxwOkF1dGhuUmVxdWVzdCB4bWxuczpzYW1scD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOnByb3RvY29sIiB4bWxuczpzYW1sPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YXNzZXJ0aW9uIiBJRD0iXzgwOTcwN2YwMDMwYTVkMDA2MjBjOWQ5ZGY5N2Y2MjdhZmU5ZGNjMjQiIFZlcnNpb249IjIuMCIgUHJvdmlkZXJOYW1lPSJTUCB0ZXN0IiBJc3N1ZUluc3RhbnQ9IjIwMTQtMDctMTZUMjM6NTI6NDVaIiBEZXN0aW5hdGlvbj0iaHR0cDovL2lkcC5leGFtcGxlLmNvbS9TU09TZXJ2aWNlLnBocCIgUHJvdG9jb2xCaW5kaW5nPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YmluZGluZ3M6SFRUUC1QT1NUIiBBc3NlcnRpb25Db25zdW1lclNlcnZpY2VVUkw9Imh0dHBzOi8vc3AuZXhhbXBsZS5vcmcvc3Avc3NvIj48c2FtbDpJc3N1ZXIgSWQ9Il8wIj5odHRwczovL3NwLmV4YW1wbGUub3JnL21ldGFkYXRhPC9zYW1sOklzc3Vlcj48c2FtbHA6TmFtZUlEUG9saWN5IEZvcm1hdD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6MS4xOm5hbWVpZC1mb3JtYXQ6ZW1haWxBZGRyZXNzIiBBbGxvd0NyZWF0ZT0idHJ1ZSIvPjxzYW1scDpSZXF1ZXN0ZWRBdXRobkNvbnRleHQgQ29tcGFyaXNvbj0iZXhhY3QiPjxzYW1sOkF1dGhuQ29udGV4dENsYXNzUmVmPnVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDphYzpjbGFzc2VzOlBhc3N3b3JkPC9zYW1sOkF1dGhuQ29udGV4dENsYXNzUmVmPjwvc2FtbHA6UmVxdWVzdGVkQXV0aG5Db250ZXh0PjxTaWduYXR1cmUgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyMiPjxTaWduZWRJbmZvPjxDYW5vbmljYWxpemF0aW9uTWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8xMC94bWwtZXhjLWMxNG4jIi8+PFNpZ25hdHVyZU1ldGhvZCBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyNyc2Etc2hhMSIvPjxSZWZlcmVuY2UgVVJJPSIjXzAiPjxUcmFuc2Zvcm1zPjxUcmFuc2Zvcm0gQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzEwL3htbC1leGMtYzE0biMiLz48L1RyYW5zZm9ybXM+PERpZ2VzdE1ldGhvZCBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyNzaGExIi8+PERpZ2VzdFZhbHVlPnRRRGlzQlhLVFErOU9YSk81cjdLdUpnYStLST08L0RpZ2VzdFZhbHVlPjwvUmVmZXJlbmNlPjwvU2lnbmVkSW5mbz48U2lnbmF0dXJlVmFsdWU+b3hSa3ZhdTdVdllnRkVaN1lOQVVOZjMwNjdWN1RuNUM5WFNJaWV0MWFadzJGWWV2Tlc1YlV5LzBteHAzYWo2QXZmRmpubXB6QWI4OEJqZHdBejJCRXJEVG9tUmN1WkI3TGIwZllUZjMxTjJvWk9YME1pUGlRT0g1NEk2M3FKVzRYbzNWcWRGN0dCdUZaWkh5bGxmU0J2N2dmQ3RqSkR3RlNDeldLNzBCOXIzY0ZNUkpaTGhDSjlvUGVuKzRVOXNjU1lPNmcrc3pCWkxsNkFpSjA2UEhjOGp6RUtHd2ZRcmNaazhrREtVbHZOZkpNVUx5cThkcHgyVnZVQXg0cDVld2ZNT3dCOVczSGwzUFBhMGRPNzd6WmlmM0NnbHBjTjA2ZittNlVZRy93bm9UUUV5S1c5aE9lKzJ2R004MFc3N2VXdTBkbWlhUHVxVDFvazhMWFB1cTFBPT08L1NpZ25hdHVyZVZhbHVlPjxLZXlJbmZvPjxkczpYNTA5RGF0YT48ZHM6WDUwOUNlcnRpZmljYXRlPk1JSURvekNDQW91Z0F3SUJBZ0lKQUtOc21MOFFiZnB3TUEwR0NTcUdTSWIzRFFFQkN3VUFNR2d4Q3pBSkJnTlZCQVlUQWtoTE1SSXdFQVlEVlFRSURBbEliMjVuSUV0dmJtY3hDekFKQmdOVkJBY01Ba2hMTVJNd0VRWURWUVFLREFwdWIyUmxMWE5oYld3eU1TTXdJUVlKS29aSWh2Y05BUWtCRmhSdWIyUmxMbk5oYld3eVFHZHRZV2xzTG1OdmJUQWVGdzB4TlRBM01EVXhOelUyTkRkYUZ3MHhPREEzTURReE56VTJORGRhTUdneEN6QUpCZ05WQkFZVEFraExNUkl3RUFZRFZRUUlEQWxJYjI1bklFdHZibWN4Q3pBSkJnTlZCQWNNQWtoTE1STXdFUVlEVlFRS0RBcHViMlJsTFhOaGJXd3lNU013SVFZSktvWklodmNOQVFrQkZoUnViMlJsTG5OaGJXd3lRR2R0WVdsc0xtTnZiVENDQVNJd0RRWUpLb1pJaHZjTkFRRUJCUUFEZ2dFUEFEQ0NBUW9DZ2dFQkFNUUpBQjhKcnNMUWJVdUphOGFrekxxTzFFWnFDbFMwdFFwK3crNXdndWZwMDdXd0duL3NobWE4ZGNRTmoxZGJqc3pJNUhCZVZGak9LSXhsZmptTkI5b3ZoUVBzdEJqUC9VUFFZcDFJcDJJb0hDWVg5SERnTXozeHlYS2JIdGhVelphRUN6K3ArN1d0Z3doY3pSa0JMRE9tMmsxNXFoUFlHUHcwdkgyemJWUkdXVUJTOWR5Mk1wM3RxbFZiUDB4WjlDRE5raENKa1Y5U01OZm9DVlcvVllQcUsyUUJvN2tpNG9ibTV4NWl4RlFTU0hzS2JWQVJWenlRSDVpTmpGZTFUZEFwM3JEd3JFNUxjMU5RbFFheFI1R25iMk5aQXBET1JSWklWbE52MldVZGk5UXZNMHlDempROTBqUDBPQW9nSGhSWWF4ZzAvdmdORXllNDZoK1BpWTBDQXdFQUFhTlFNRTR3SFFZRFZSME9CQllFRkVWa2pjTEFJVG5ka3kwOTBBeTc0UXFDbVFLSU1COEdBMVVkSXdRWU1CYUFGRVZramNMQUlUbmRreTA5MEF5NzRRcUNtUUtJTUF3R0ExVWRFd1FGTUFNQkFmOHdEUVlKS29aSWh2Y05BUUVMQlFBRGdnRUJBRzRsWVgzS1FYZW5lejRMcERuWmhjRkJFWmk5WXN0VUtQRjVFS2QrV3BscFZiY1RRYzFBMy9aK3VIUm15VjhoK3BRemVGNkxpb2IzN0c4N1lwYWNQcGxKSTY2Y2YyUmo3ajhoU0JOYmRyKzY2RTJxcGNFaEFGMWlKbXpCTnloYi95ZGxFdVZwbjgvRXNvUCtIdkJlaURsNWdvbjM1NjJNelpJZ1YvcExkVGZ4SHlXNmh6QVFoakdxMlVoY3ZSK2dYTlZKdkhQMmVTNGpsSG5Ka0I5YmZvMGt2Zjg3UStENlhLWDNxNWMzbU84dHFXNlVwcUhTQyt1TEVwelppTkxldUZhNFRVSWhnQmdqRGpsUnJOREt1OG5kYW5jU24zeUJIWW5xSjJ0OWNSK2NvRm5uallBQlFwTnJ2azRtdG1YWThTWG9CellHOVkrbHFlQXVuNiswWXlFPTwvZHM6WDUwOUNlcnRpZmljYXRlPjwvZHM6WDUwOURhdGE+PC9LZXlJbmZvPjwvU2lnbmF0dXJlPjwvc2FtbHA6QXV0aG5SZXF1ZXN0Pg==';
  const dummySignRequestSHA256: string = 'PHNhbWxwOkF1dGhuUmVxdWVzdCB4bWxuczpzYW1scD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOnByb3RvY29sIiB4bWxuczpzYW1sPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YXNzZXJ0aW9uIiBJRD0iXzgwOTcwN2YwMDMwYTVkMDA2MjBjOWQ5ZGY5N2Y2MjdhZmU5ZGNjMjQiIFZlcnNpb249IjIuMCIgUHJvdmlkZXJOYW1lPSJTUCB0ZXN0IiBJc3N1ZUluc3RhbnQ9IjIwMTQtMDctMTZUMjM6NTI6NDVaIiBEZXN0aW5hdGlvbj0iaHR0cDovL2lkcC5leGFtcGxlLmNvbS9TU09TZXJ2aWNlLnBocCIgUHJvdG9jb2xCaW5kaW5nPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YmluZGluZ3M6SFRUUC1QT1NUIiBBc3NlcnRpb25Db25zdW1lclNlcnZpY2VVUkw9Imh0dHBzOi8vc3AuZXhhbXBsZS5vcmcvc3Avc3NvIj48c2FtbDpJc3N1ZXIgSWQ9Il8wIj5odHRwczovL3NwLmV4YW1wbGUub3JnL21ldGFkYXRhPC9zYW1sOklzc3Vlcj48c2FtbHA6TmFtZUlEUG9saWN5IEZvcm1hdD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6MS4xOm5hbWVpZC1mb3JtYXQ6ZW1haWxBZGRyZXNzIiBBbGxvd0NyZWF0ZT0idHJ1ZSIvPjxzYW1scDpSZXF1ZXN0ZWRBdXRobkNvbnRleHQgQ29tcGFyaXNvbj0iZXhhY3QiPjxzYW1sOkF1dGhuQ29udGV4dENsYXNzUmVmPnVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDphYzpjbGFzc2VzOlBhc3N3b3JkPC9zYW1sOkF1dGhuQ29udGV4dENsYXNzUmVmPjwvc2FtbHA6UmVxdWVzdGVkQXV0aG5Db250ZXh0PjxTaWduYXR1cmUgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyMiPjxTaWduZWRJbmZvPjxDYW5vbmljYWxpemF0aW9uTWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8xMC94bWwtZXhjLWMxNG4jIi8+PFNpZ25hdHVyZU1ldGhvZCBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvMDQveG1sZHNpZy1tb3JlI3JzYS1zaGEyNTYiLz48UmVmZXJlbmNlIFVSST0iI18wIj48VHJhbnNmb3Jtcz48VHJhbnNmb3JtIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8xMC94bWwtZXhjLWMxNG4jIi8+PC9UcmFuc2Zvcm1zPjxEaWdlc3RNZXRob2QgQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzA0L3htbGVuYyNzaGEyNTYiLz48RGlnZXN0VmFsdWU+d3VKWlJSdWlGb0FQZVZXVllReXhOWXpjbUpJdXB0dTZmaE10MVZuQVZQbz08L0RpZ2VzdFZhbHVlPjwvUmVmZXJlbmNlPjwvU2lnbmVkSW5mbz48U2lnbmF0dXJlVmFsdWU+V0VUTUtaL1pzTm5pbDVjVCtHeTFKbmJWMVVscUN2N205SlppZ1NLTXFhbFlOL1ZDclMxelpFMkVOekxFSjhCN1ZaVkMyRVJBT2pHL1lHbWJ4Si95K2Z6YVR1bGh0blhrYUZncytmNEdJZDBISDY0MldKRnRBeUg2RS81SUVVWUVXYUk0TzA5MWgvd2EvM2EyNEJZK3R5L0ExSmIxLzM5NXpXVi84NUZETXFNemdVRDdRYkQ4TG5mcThkS1hJZDdQWmdnVnpQTFpvRHo0YXpaL3V4VG9aUkxwKy9XVjZHQy91Y2lLMmVmR1hMb09NMm1wcElDc05qVk9mT1NEM2pXS3BjQk11bDBRMjJZMGFoaXlKWDlFcnZkSEcwV0RMcXI0RXc5TGFqVVNydFovaGNqR1ZIemhZZCs1YklYSXp6ZWlmbUF6Snp4WFM4cmhjNGVoV25OYTJ3PT08L1NpZ25hdHVyZVZhbHVlPjxLZXlJbmZvPjxkczpYNTA5RGF0YT48ZHM6WDUwOUNlcnRpZmljYXRlPk1JSURvekNDQW91Z0F3SUJBZ0lKQUtOc21MOFFiZnB3TUEwR0NTcUdTSWIzRFFFQkN3VUFNR2d4Q3pBSkJnTlZCQVlUQWtoTE1SSXdFQVlEVlFRSURBbEliMjVuSUV0dmJtY3hDekFKQmdOVkJBY01Ba2hMTVJNd0VRWURWUVFLREFwdWIyUmxMWE5oYld3eU1TTXdJUVlKS29aSWh2Y05BUWtCRmhSdWIyUmxMbk5oYld3eVFHZHRZV2xzTG1OdmJUQWVGdzB4TlRBM01EVXhOelUyTkRkYUZ3MHhPREEzTURReE56VTJORGRhTUdneEN6QUpCZ05WQkFZVEFraExNUkl3RUFZRFZRUUlEQWxJYjI1bklFdHZibWN4Q3pBSkJnTlZCQWNNQWtoTE1STXdFUVlEVlFRS0RBcHViMlJsTFhOaGJXd3lNU013SVFZSktvWklodmNOQVFrQkZoUnViMlJsTG5OaGJXd3lRR2R0WVdsc0xtTnZiVENDQVNJd0RRWUpLb1pJaHZjTkFRRUJCUUFEZ2dFUEFEQ0NBUW9DZ2dFQkFNUUpBQjhKcnNMUWJVdUphOGFrekxxTzFFWnFDbFMwdFFwK3crNXdndWZwMDdXd0duL3NobWE4ZGNRTmoxZGJqc3pJNUhCZVZGak9LSXhsZmptTkI5b3ZoUVBzdEJqUC9VUFFZcDFJcDJJb0hDWVg5SERnTXozeHlYS2JIdGhVelphRUN6K3ArN1d0Z3doY3pSa0JMRE9tMmsxNXFoUFlHUHcwdkgyemJWUkdXVUJTOWR5Mk1wM3RxbFZiUDB4WjlDRE5raENKa1Y5U01OZm9DVlcvVllQcUsyUUJvN2tpNG9ibTV4NWl4RlFTU0hzS2JWQVJWenlRSDVpTmpGZTFUZEFwM3JEd3JFNUxjMU5RbFFheFI1R25iMk5aQXBET1JSWklWbE52MldVZGk5UXZNMHlDempROTBqUDBPQW9nSGhSWWF4ZzAvdmdORXllNDZoK1BpWTBDQXdFQUFhTlFNRTR3SFFZRFZSME9CQllFRkVWa2pjTEFJVG5ka3kwOTBBeTc0UXFDbVFLSU1COEdBMVVkSXdRWU1CYUFGRVZramNMQUlUbmRreTA5MEF5NzRRcUNtUUtJTUF3R0ExVWRFd1FGTUFNQkFmOHdEUVlKS29aSWh2Y05BUUVMQlFBRGdnRUJBRzRsWVgzS1FYZW5lejRMcERuWmhjRkJFWmk5WXN0VUtQRjVFS2QrV3BscFZiY1RRYzFBMy9aK3VIUm15VjhoK3BRemVGNkxpb2IzN0c4N1lwYWNQcGxKSTY2Y2YyUmo3ajhoU0JOYmRyKzY2RTJxcGNFaEFGMWlKbXpCTnloYi95ZGxFdVZwbjgvRXNvUCtIdkJlaURsNWdvbjM1NjJNelpJZ1YvcExkVGZ4SHlXNmh6QVFoakdxMlVoY3ZSK2dYTlZKdkhQMmVTNGpsSG5Ka0I5YmZvMGt2Zjg3UStENlhLWDNxNWMzbU84dHFXNlVwcUhTQyt1TEVwelppTkxldUZhNFRVSWhnQmdqRGpsUnJOREt1OG5kYW5jU24zeUJIWW5xSjJ0OWNSK2NvRm5uallBQlFwTnJ2azRtdG1YWThTWG9CellHOVkrbHFlQXVuNiswWXlFPTwvZHM6WDUwOUNlcnRpZmljYXRlPjwvZHM6WDUwOURhdGE+PC9LZXlJbmZvPjwvU2lnbmF0dXJlPjwvc2FtbHA6QXV0aG5SZXF1ZXN0Pg==';
  const dummySignRequestSHA512: string = 'PHNhbWxwOkF1dGhuUmVxdWVzdCB4bWxuczpzYW1scD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOnByb3RvY29sIiB4bWxuczpzYW1sPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YXNzZXJ0aW9uIiBJRD0iXzgwOTcwN2YwMDMwYTVkMDA2MjBjOWQ5ZGY5N2Y2MjdhZmU5ZGNjMjQiIFZlcnNpb249IjIuMCIgUHJvdmlkZXJOYW1lPSJTUCB0ZXN0IiBJc3N1ZUluc3RhbnQ9IjIwMTQtMDctMTZUMjM6NTI6NDVaIiBEZXN0aW5hdGlvbj0iaHR0cDovL2lkcC5leGFtcGxlLmNvbS9TU09TZXJ2aWNlLnBocCIgUHJvdG9jb2xCaW5kaW5nPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YmluZGluZ3M6SFRUUC1QT1NUIiBBc3NlcnRpb25Db25zdW1lclNlcnZpY2VVUkw9Imh0dHBzOi8vc3AuZXhhbXBsZS5vcmcvc3Avc3NvIj48c2FtbDpJc3N1ZXIgSWQ9Il8wIj5odHRwczovL3NwLmV4YW1wbGUub3JnL21ldGFkYXRhPC9zYW1sOklzc3Vlcj48c2FtbHA6TmFtZUlEUG9saWN5IEZvcm1hdD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6MS4xOm5hbWVpZC1mb3JtYXQ6ZW1haWxBZGRyZXNzIiBBbGxvd0NyZWF0ZT0idHJ1ZSIvPjxzYW1scDpSZXF1ZXN0ZWRBdXRobkNvbnRleHQgQ29tcGFyaXNvbj0iZXhhY3QiPjxzYW1sOkF1dGhuQ29udGV4dENsYXNzUmVmPnVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDphYzpjbGFzc2VzOlBhc3N3b3JkPC9zYW1sOkF1dGhuQ29udGV4dENsYXNzUmVmPjwvc2FtbHA6UmVxdWVzdGVkQXV0aG5Db250ZXh0PjxTaWduYXR1cmUgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyMiPjxTaWduZWRJbmZvPjxDYW5vbmljYWxpemF0aW9uTWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8xMC94bWwtZXhjLWMxNG4jIi8+PFNpZ25hdHVyZU1ldGhvZCBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvMDQveG1sZHNpZy1tb3JlI3JzYS1zaGE1MTIiLz48UmVmZXJlbmNlIFVSST0iI18wIj48VHJhbnNmb3Jtcz48VHJhbnNmb3JtIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8xMC94bWwtZXhjLWMxNG4jIi8+PC9UcmFuc2Zvcm1zPjxEaWdlc3RNZXRob2QgQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzA0L3htbGVuYyNzaGE1MTIiLz48RGlnZXN0VmFsdWU+RWN3emlpSzZmazFNK2RETkpHNVlFeWpGY3Fjc0dzRmZNNGFDUkJKcENWTlltVWs4NWJxQk8rblRFN3RmRnd5Uk1yOUZBODBpSnN3MlFwM3R4QTE1Q2c9PTwvRGlnZXN0VmFsdWU+PC9SZWZlcmVuY2U+PC9TaWduZWRJbmZvPjxTaWduYXR1cmVWYWx1ZT5MVmFYajQ3MlZEalBvQU1hZ1BNcEswdGwvckV1c2llVXc4SXZrVVJmVVJDKzl1YXNqRXgxZjR4S1dkYUJLa09zQUhIZ1RMVlpxUnBNY1RBVnJTWDM5SnN1TmRDZnlycXBZTWlBY0w0RXhTM3dOSXdBenFCY1RiUlgxdEY2Nzk5cENYVXVOTE84NVdyN3FwZG5RTnFkTWc1L0E5a0xzUjFSc2dOeFhtandPM1dKUDhucFJ5dXYrVjJvNXhvN01FOVYyaVE4ODRhWVhnNUJodWQ5S1huSU5TZWw5YjN2NnV6T3V2VlFSM1ZCTlFWUXhRaGNUNlFpZ1BkR1hqZDl0cEU4TXV0UG5ZS1NNbHJKc1Ird2wzV2ZacmhwQ2E4U2JGS0RjNnBja1lmVUJYV3pRVVFJVkpXRm5icXBlemJsSUk2NmtlNlRvSzVseVpiajRSajFEcytjMHc9PTwvU2lnbmF0dXJlVmFsdWU+PEtleUluZm8+PGRzOlg1MDlEYXRhPjxkczpYNTA5Q2VydGlmaWNhdGU+TUlJRG96Q0NBb3VnQXdJQkFnSUpBS05zbUw4UWJmcHdNQTBHQ1NxR1NJYjNEUUVCQ3dVQU1HZ3hDekFKQmdOVkJBWVRBa2hMTVJJd0VBWURWUVFJREFsSWIyNW5JRXR2Ym1jeEN6QUpCZ05WQkFjTUFraExNUk13RVFZRFZRUUtEQXB1YjJSbExYTmhiV3d5TVNNd0lRWUpLb1pJaHZjTkFRa0JGaFJ1YjJSbExuTmhiV3d5UUdkdFlXbHNMbU52YlRBZUZ3MHhOVEEzTURVeE56VTJORGRhRncweE9EQTNNRFF4TnpVMk5EZGFNR2d4Q3pBSkJnTlZCQVlUQWtoTE1SSXdFQVlEVlFRSURBbEliMjVuSUV0dmJtY3hDekFKQmdOVkJBY01Ba2hMTVJNd0VRWURWUVFLREFwdWIyUmxMWE5oYld3eU1TTXdJUVlKS29aSWh2Y05BUWtCRmhSdWIyUmxMbk5oYld3eVFHZHRZV2xzTG1OdmJUQ0NBU0l3RFFZSktvWklodmNOQVFFQkJRQURnZ0VQQURDQ0FRb0NnZ0VCQU1RSkFCOEpyc0xRYlV1SmE4YWt6THFPMUVacUNsUzB0UXArdys1d2d1ZnAwN1d3R24vc2htYThkY1FOajFkYmpzekk1SEJlVkZqT0tJeGxmam1OQjlvdmhRUHN0QmpQL1VQUVlwMUlwMklvSENZWDlIRGdNejN4eVhLYkh0aFV6WmFFQ3orcCs3V3Rnd2hjelJrQkxET20yazE1cWhQWUdQdzB2SDJ6YlZSR1dVQlM5ZHkyTXAzdHFsVmJQMHhaOUNETmtoQ0prVjlTTU5mb0NWVy9WWVBxSzJRQm83a2k0b2JtNXg1aXhGUVNTSHNLYlZBUlZ6eVFINWlOakZlMVRkQXAzckR3ckU1TGMxTlFsUWF4UjVHbmIyTlpBcERPUlJaSVZsTnYyV1VkaTlRdk0weUN6alE5MGpQME9Bb2dIaFJZYXhnMC92Z05FeWU0NmgrUGlZMENBd0VBQWFOUU1FNHdIUVlEVlIwT0JCWUVGRVZramNMQUlUbmRreTA5MEF5NzRRcUNtUUtJTUI4R0ExVWRJd1FZTUJhQUZFVmtqY0xBSVRuZGt5MDkwQXk3NFFxQ21RS0lNQXdHQTFVZEV3UUZNQU1CQWY4d0RRWUpLb1pJaHZjTkFRRUxCUUFEZ2dFQkFHNGxZWDNLUVhlbmV6NExwRG5aaGNGQkVaaTlZc3RVS1BGNUVLZCtXcGxwVmJjVFFjMUEzL1ordUhSbXlWOGgrcFF6ZUY2TGlvYjM3Rzg3WXBhY1BwbEpJNjZjZjJSajdqOGhTQk5iZHIrNjZFMnFwY0VoQUYxaUptekJOeWhiL3lkbEV1VnBuOC9Fc29QK0h2QmVpRGw1Z29uMzU2Mk16WklnVi9wTGRUZnhIeVc2aHpBUWhqR3EyVWhjdlIrZ1hOVkp2SFAyZVM0amxIbkprQjliZm8wa3ZmODdRK0Q2WEtYM3E1YzNtTzh0cVc2VXBxSFNDK3VMRXB6WmlOTGV1RmE0VFVJaGdCZ2pEamxSck5ES3U4bmRhbmNTbjN5QkhZbnFKMnQ5Y1IrY29Gbm5qWUFCUXBOcnZrNG10bVhZOFNYb0J6WUc5WStscWVBdW42KzBZeUU9PC9kczpYNTA5Q2VydGlmaWNhdGU+PC9kczpYNTA5RGF0YT48L0tleUluZm8+PC9TaWduYXR1cmU+PC9zYW1scDpBdXRoblJlcXVlc3Q+';

  test('sign a SAML message with RSA-SHA1', t => {
    t.is(libsaml.constructMessageSignature(octetString, _spPrivPem, _spPrivKeyPass).toString('base64'), signatureB64SHA1);
  });
  test('sign a SAML message with RSA-SHA256', t => {
    t.is(libsaml.constructMessageSignature(octetStringSHA256, _spPrivPem, _spPrivKeyPass, null, signatureAlgorithms.RSA_SHA256).toString('base64'), signatureB64SHA256);
  });
  test('sign a SAML message with RSA-SHA512', t => {
    t.is(libsaml.constructMessageSignature(octetStringSHA512, _spPrivPem, _spPrivKeyPass, null, signatureAlgorithms.RSA_SHA512).toString('base64'), signatureB64SHA512);
  });
  test('verify binary SAML message signed with RSA-SHA1', t => {
    const signature = libsaml.constructMessageSignature(octetString, _spPrivPem, _spPrivKeyPass, false);
    t.is(libsaml.verifyMessageSignature(SPMetadata, octetString, signature), true);
  });
  test('verify binary SAML message signed with RSA-SHA256', t => {
    const signature = libsaml.constructMessageSignature(octetStringSHA256, _spPrivPem, _spPrivKeyPass, false, signatureAlgorithms.RSA_SHA256);
    t.is(libsaml.verifyMessageSignature(SPMetadata, octetStringSHA256, signature, signatureAlgorithms.RSA_SHA256), true);
  });
  test('verify binary SAML message signed with RSA-SHA512', t => {
    const signature = libsaml.constructMessageSignature(octetStringSHA512, _spPrivPem, _spPrivKeyPass, false, signatureAlgorithms.RSA_SHA512);
    t.is(libsaml.verifyMessageSignature(SPMetadata, octetStringSHA512, signature, signatureAlgorithms.RSA_SHA512), true);
  });
  test('verify stringified SAML message signed with RSA-SHA1', t => {
    const signature = libsaml.constructMessageSignature(octetString, _spPrivPem, _spPrivKeyPass);
    t.is(libsaml.verifyMessageSignature(SPMetadata, octetString, new Buffer(signature, 'base64')), true);
  });
  test('verify stringified SAML message signed with RSA-SHA256', t => {
    const signature = libsaml.constructMessageSignature(octetStringSHA256, _spPrivPem, _spPrivKeyPass);
    t.is(libsaml.verifyMessageSignature(SPMetadata, octetStringSHA256, new Buffer(signature, 'base64')), true);
  });
  test('verify stringified SAML message signed with RSA-SHA512', t => {
    const signature = libsaml.constructMessageSignature(octetStringSHA512, _spPrivPem, _spPrivKeyPass);
    t.is(libsaml.verifyMessageSignature(SPMetadata, octetStringSHA512, new Buffer(signature, 'base64')), true);
  });
  test('construct signature with RSA-SHA1', t => {
    t.is(libsaml.constructSAMLSignature({
      rawSamlMessage: _originRequest,
      referenceTagXPath: libsaml.createXPath('Issuer'),
      signingCert: SPMetadata.getX509Certificate('signing'),
      privateKey: _spPrivPem,
      privateKeyPass: _spPrivKeyPass,
      signatureAlgorithm: signatureAlgorithms.RSA_SHA1,
    }), dummySignRequest);
  });
  test('construct signature with RSA-SHA256', t => {
    t.is(libsaml.constructSAMLSignature({
      rawSamlMessage: _originRequest,
      referenceTagXPath: libsaml.createXPath('Issuer'),
      signingCert: SPMetadata.getX509Certificate('signing'),
      privateKey: _spPrivPem,
      privateKeyPass: _spPrivKeyPass,
      signatureAlgorithm: signatureAlgorithms.RSA_SHA256,
    }), dummySignRequestSHA256);
  });
  test('construct signature with RSA-SHA512', t => {
    t.is(libsaml.constructSAMLSignature({
      rawSamlMessage: _originRequest,
      referenceTagXPath: libsaml.createXPath('Issuer'),
      signingCert: SPMetadata.getX509Certificate('signing'),
      privateKey: _spPrivPem,
      privateKeyPass: _spPrivKeyPass,
      signatureAlgorithm: signatureAlgorithms.RSA_SHA512,
    }), dummySignRequestSHA512);
  });
  test('verify a XML signature signed by RSA-SHA1 with metadata', t => {
    t.is(libsaml.verifySignature(_decodedResponse, { cert: IdPMetadata }), true);
  });
  test('integrity check for request signed with RSA-SHA1', t => {
    t.is(libsaml.verifySignature(_falseDecodedRequestSHA1, { cert: SPMetadata, signatureAlgorithm: signatureAlgorithms.RSA_SHA1 }), false);
  });
  test('verify a XML signature signed by RSA-SHA256 with metadata', t => {
    t.is(libsaml.verifySignature(_decodedRequestSHA256, { cert: SPMetadata, signatureAlgorithm: signatureAlgorithms.RSA_SHA256 }), true);
  });
  test('integrity check for request signed with RSA-SHA256', t => {
    t.is(libsaml.verifySignature(_falseDecodedRequestSHA256, { cert: SPMetadata, signatureAlgorithm: signatureAlgorithms.RSA_SHA256 }), false);
  });
  test('verify a XML signature signed by RSA-SHA512 with metadata', t => {
    t.is(libsaml.verifySignature(_decodedRequestSHA512, { cert: SPMetadata, signatureAlgorithm: signatureAlgorithms.RSA_SHA512 }), true);
  });
  test('integrity check for request signed with RSA-SHA512', t => {
    t.is(libsaml.verifySignature(_falseDecodedRequestSHA512, { cert: SPMetadata, signatureAlgorithm: signatureAlgorithms.RSA_SHA512 }), false);
  });
  test('verify a XML signature signed by RSA-SHA1 with .cer keyFile', t => {
    const xml = String(readFileSync('./test/misc/signed_request_sha1.xml'));
    const decodedResponseDoc = new dom().parseFromString(xml);
    const signature = select(decodedResponseDoc, "/*/*[local-name(.)='Signature']")[0];
    t.is(libsaml.verifySignature(xml, { keyFile: './test/key/sp/cert.cer' }), true);
  });
  test('verify a XML signature signed by RSA-SHA256 with .cer keyFile', t => {
    const xml = String(readFileSync('./test/misc/signed_request_sha256.xml'));
    const decodedResponseDoc = new dom().parseFromString(xml);
    const signature = select(decodedResponseDoc, "/*/*[local-name(.)='Signature']")[0];
    t.is(libsaml.verifySignature(xml, { keyFile: './test/key/sp/cert.cer' }), true);
  });
  test('verify a XML signature signed by RSA-SHA512 with .cer keyFile', t => {
    const xml = String(readFileSync('./test/misc/signed_request_sha512.xml'));
    const decodedResponseDoc = new dom().parseFromString(xml);
    const signature = select(decodedResponseDoc, "/*/*[local-name(.)='Signature']")[0];
    t.is(libsaml.verifySignature(xml, { keyFile: './test/key/sp/cert.cer' }), true);
  });
  /** high-level extractor */
  test('get innerText returns a value', t => {
    t.is(libsaml.extractor(_decodedResponse, ['NameID'])['nameid'], '_ce3d2948b4cf20146dee0a0b3dd6f69b6cf86f62d7');
  });
  test('get innerText returns undefined', t => {
    t.is(libsaml.extractor(_decodedResponse, ['notexist'])['notexist'] === undefined, true);
  });
  test('get innerText returns an array of values', t => {
    t.is(JSON.stringify((libsaml.extractor(_decodedResponse, ['AttributeValue']))), JSON.stringify({
      attributevalue: ['test', 'test@example.com', 'users', 'examplerole1'],
    }));
  });
  test('get innerText returns a value with custom key', t => {
    t.is(libsaml.extractor(_decodedResponse, [{ localName: 'NameID', customKey: 'nid' }])['nid'], '_ce3d2948b4cf20146dee0a0b3dd6f69b6cf86f62d7');
  });

  test('get attributes returns an object', t => {
    t.is(JSON.stringify(libsaml.extractor(_decodedResponse, [{
      localName: 'Conditions',
      attributes: ['NotBefore', 'NotOnOrAfter'],
    }])), JSON.stringify({
      conditions: {
        notbefore: '2014-07-17T01:01:18Z',
        notonorafter: '2024-01-18T06:21:48Z',
      },
    }));
  });
  test('get attributes returns an array of objects', t => {
    t.is(JSON.stringify(libsaml.extractor(_decodedResponse, [{
      localName: 'Attribute',
      attributes: ['Name', 'NameFormat'],
    }])['attribute']), JSON.stringify([{
      name: 'uid',
      nameformat: 'urn:oasis:names:tc:SAML:2.0:attrname-format:basic',
    }, {
      name: 'mail',
      nameformat: 'urn:oasis:names:tc:SAML:2.0:attrname-format:basic',
    }, {
      name: 'eduPersonAffiliation',
      nameformat: 'urn:oasis:names:tc:SAML:2.0:attrname-format:basic',
    }]));
  });
  test('get attributes returns an undefined for non-exist attribute', t => {
    t.is(libsaml.extractor(_decodedResponse, [{
      localName: 'Conditions',
      attributes: ['notexist'],
    }])['conditions'].notexist === undefined, true);
  });
  test('get attributes returns an undefined with non-exist localName', t => {
    t.is(libsaml.extractor(_decodedResponse, [{
      localName: 'Condition',
      attributes: ['notexist'],
    }])['condition'] === undefined, true);
  });
  test('get attributes returns a value with custom key', t => {
    t.is(libsaml.extractor(_decodedResponse, [{
      localName: 'Conditions',
      attributes: ['notexist'],
      customKey: 'cd',
    }])['cd'].notexist === undefined, true);
  });

  test('get entire text returns a xml string', t => {
    t.is(JSON.stringify(libsaml.extractor(_decodedResponse, [{
      localName: 'Signature',
      extractEntireBody: true,
    }]).signature), JSON.stringify('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="#_d71a3a8e9fcc45c9e9d248ef7049393fc8f04e5f75"><Transforms><Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>sZOR3aMpVBn1CoSmP674OQfCcyg=</DigestValue></Reference></SignedInfo><SignatureValue>h7Dk6GTh4MrNNx8b8Or12SeGsAGBM/ILd7Jgz/RuqR6ixMHrmkRAotou8LvKOzH9I9BfLthqgwcNJGm4hMPHcxoiyVlkqWqnpIMxlWc/vb1E/lXjwo86mZ/hBUJdRhgIfrgIDKCMBf98ftWtUF8I1Hd5qBvY7pTMk3ErQYOtqBfvCCFGwejAfOUKwtY4itQ7AILi4Er2IgALH0zJO7alPugTOwmICd998rafB2wAHWREJkaOfCgCasRkB8tqcWjpLx2oMqiYSTVq2d6PBgAFSmoN9ltO2neTz9pqd0BA1BKIi7PjQYN+F7dB/ffG7V8VjNoPMROrHzq6sY3Ondtv7w==</SignatureValue><KeyInfo><X509Data><X509Certificate>MIIDlzCCAn+gAwIBAgIJAO1ymQc33+bWMA0GCSqGSIb3DQEBCwUAMGIxCzAJBgNVBAYTAkhLMRMwEQYDVQQIDApTb21lLVN0YXRlMRowGAYDVQQKDBFJZGVudGl0eSBQcm92aWRlcjEUMBIGA1UECwwLRGV2ZWxvcG1lbnQxDDAKBgNVBAMMA0lEUDAeFw0xNTA3MDUxODAyMjdaFw0xODA3MDQxODAyMjdaMGIxCzAJBgNVBAYTAkhLMRMwEQYDVQQIDApTb21lLVN0YXRlMRowGAYDVQQKDBFJZGVudGl0eSBQcm92aWRlcjEUMBIGA1UECwwLRGV2ZWxvcG1lbnQxDDAKBgNVBAMMA0lEUDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAODZsWhCe+yG0PalQPTUoD7yko5MTWMCRxJ8hSm2k7mG3Eg/Y2v0EBdCmTw7iDCevRqUmbmFnq7MROyV4eriJzh0KabAdZf7/k6koghst3ZUtWOwzshyxkBtWDwGmBpQGTGsKxJ8M1js3aSqNRXBT4OBWM9w2Glt1+8ty30RhYv3pSF+/HHLH7Ac+vLSIAlokaFW34RWTcJ/8rADuRWlXih4GfnIu0W/ncm5nTSaJiRAvr3dGDRO/khiXoJdbbOj7dHPULxVGbH9IbPK76TCwLbF7ikIMsPovVbTrpyL6vsbVUKeEl/5GKppTwp9DLAOeoSYpCYkkDkYKu9TRQjF02MCAwEAAaNQME4wHQYDVR0OBBYEFP2ut2AQdy6D1dwdwK740IHmbh38MB8GA1UdIwQYMBaAFP2ut2AQdy6D1dwdwK740IHmbh38MAwGA1UdEwQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBANMZUoPNmHzgja2PYkbvBYMHmpvUkVoiuvQ9cJPlqGTB2CRfG68BNNs/Clz8P7cIrAdkhCUwi1rSBhDuslGFNrSaIpv6B10FpBuKwef3G7YrPWFNEN6khY7aHNWSTHqKgs1DrGef2B9hvkrnHWbQVSVXrBFKe1wTCqcgGcOpYoSK7L8C6iX6uIA/uZYnVQ4NgBrizJ0azkjdegz3hwO/gt4malEURy8D85/AAVt6PAzhpb9VJUGxSXr/EfntVUEz3L2gUFWWk1CnZFyz0rIOEt/zPmeAY8BLyd/Tjxm4Y+gwNazKq5y9AJS+m858b/nM4QdCnUE4yyoWAJDUHiAmvFA=</X509Certificate></X509Data></KeyInfo></Signature>'));
  });
  test('get entire text returns undefined', t => {
    t.is(libsaml.extractor(_decodedResponse, [{ localName: 'Not Exist', extractEntireBody: true }]).signature === undefined, true);
  });
  test('get entire text returns a value with custom key', t => {
    t.is(JSON.stringify(libsaml.extractor(_decodedResponse, [{
      localName: 'Signature',
      extractEntireBody: true,
      customKey: 'cd',
    }])['cd']), JSON.stringify('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="#_d71a3a8e9fcc45c9e9d248ef7049393fc8f04e5f75"><Transforms><Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>sZOR3aMpVBn1CoSmP674OQfCcyg=</DigestValue></Reference></SignedInfo><SignatureValue>h7Dk6GTh4MrNNx8b8Or12SeGsAGBM/ILd7Jgz/RuqR6ixMHrmkRAotou8LvKOzH9I9BfLthqgwcNJGm4hMPHcxoiyVlkqWqnpIMxlWc/vb1E/lXjwo86mZ/hBUJdRhgIfrgIDKCMBf98ftWtUF8I1Hd5qBvY7pTMk3ErQYOtqBfvCCFGwejAfOUKwtY4itQ7AILi4Er2IgALH0zJO7alPugTOwmICd998rafB2wAHWREJkaOfCgCasRkB8tqcWjpLx2oMqiYSTVq2d6PBgAFSmoN9ltO2neTz9pqd0BA1BKIi7PjQYN+F7dB/ffG7V8VjNoPMROrHzq6sY3Ondtv7w==</SignatureValue><KeyInfo><X509Data><X509Certificate>MIIDlzCCAn+gAwIBAgIJAO1ymQc33+bWMA0GCSqGSIb3DQEBCwUAMGIxCzAJBgNVBAYTAkhLMRMwEQYDVQQIDApTb21lLVN0YXRlMRowGAYDVQQKDBFJZGVudGl0eSBQcm92aWRlcjEUMBIGA1UECwwLRGV2ZWxvcG1lbnQxDDAKBgNVBAMMA0lEUDAeFw0xNTA3MDUxODAyMjdaFw0xODA3MDQxODAyMjdaMGIxCzAJBgNVBAYTAkhLMRMwEQYDVQQIDApTb21lLVN0YXRlMRowGAYDVQQKDBFJZGVudGl0eSBQcm92aWRlcjEUMBIGA1UECwwLRGV2ZWxvcG1lbnQxDDAKBgNVBAMMA0lEUDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAODZsWhCe+yG0PalQPTUoD7yko5MTWMCRxJ8hSm2k7mG3Eg/Y2v0EBdCmTw7iDCevRqUmbmFnq7MROyV4eriJzh0KabAdZf7/k6koghst3ZUtWOwzshyxkBtWDwGmBpQGTGsKxJ8M1js3aSqNRXBT4OBWM9w2Glt1+8ty30RhYv3pSF+/HHLH7Ac+vLSIAlokaFW34RWTcJ/8rADuRWlXih4GfnIu0W/ncm5nTSaJiRAvr3dGDRO/khiXoJdbbOj7dHPULxVGbH9IbPK76TCwLbF7ikIMsPovVbTrpyL6vsbVUKeEl/5GKppTwp9DLAOeoSYpCYkkDkYKu9TRQjF02MCAwEAAaNQME4wHQYDVR0OBBYEFP2ut2AQdy6D1dwdwK740IHmbh38MB8GA1UdIwQYMBaAFP2ut2AQdy6D1dwdwK740IHmbh38MAwGA1UdEwQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBANMZUoPNmHzgja2PYkbvBYMHmpvUkVoiuvQ9cJPlqGTB2CRfG68BNNs/Clz8P7cIrAdkhCUwi1rSBhDuslGFNrSaIpv6B10FpBuKwef3G7YrPWFNEN6khY7aHNWSTHqKgs1DrGef2B9hvkrnHWbQVSVXrBFKe1wTCqcgGcOpYoSK7L8C6iX6uIA/uZYnVQ4NgBrizJ0azkjdegz3hwO/gt4malEURy8D85/AAVt6PAzhpb9VJUGxSXr/EfntVUEz3L2gUFWWk1CnZFyz0rIOEt/zPmeAY8BLyd/Tjxm4Y+gwNazKq5y9AJS+m858b/nM4QdCnUE4yyoWAJDUHiAmvFA=</X509Certificate></X509Data></KeyInfo></Signature>'));
  });

  test('get attirbute-innerText (kv) pair, single value returns string', t => {
    t.is(JSON.stringify(libsaml.extractor(SPMetadata.xmlString, [{
      localName: {
        tag: 'KeyDescriptor',
        key: 'use',
      },
      valueTag: 'X509Certificate',
    }])), '{"keydescriptor":{"signing":"MIIDozCCAougAwIBAgIJAKNsmL8QbfpwMA0GCSqGSIb3DQEBCwUAMGgxCzAJBgNVBAYTAkhLMRIwEAYDVQQIDAlIb25nIEtvbmcxCzAJBgNVBAcMAkhLMRMwEQYDVQQKDApub2RlLXNhbWwyMSMwIQYJKoZIhvcNAQkBFhRub2RlLnNhbWwyQGdtYWlsLmNvbTAeFw0xNTA3MDUxNzU2NDdaFw0xODA3MDQxNzU2NDdaMGgxCzAJBgNVBAYTAkhLMRIwEAYDVQQIDAlIb25nIEtvbmcxCzAJBgNVBAcMAkhLMRMwEQYDVQQKDApub2RlLXNhbWwyMSMwIQYJKoZIhvcNAQkBFhRub2RlLnNhbWwyQGdtYWlsLmNvbTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAMQJAB8JrsLQbUuJa8akzLqO1EZqClS0tQp+w+5wgufp07WwGn/shma8dcQNj1dbjszI5HBeVFjOKIxlfjmNB9ovhQPstBjP/UPQYp1Ip2IoHCYX9HDgMz3xyXKbHthUzZaECz+p+7WtgwhczRkBLDOm2k15qhPYGPw0vH2zbVRGWUBS9dy2Mp3tqlVbP0xZ9CDNkhCJkV9SMNfoCVW/VYPqK2QBo7ki4obm5x5ixFQSSHsKbVARVzyQH5iNjFe1TdAp3rDwrE5Lc1NQlQaxR5Gnb2NZApDORRZIVlNv2WUdi9QvM0yCzjQ90jP0OAogHhRYaxg0/vgNEye46h+PiY0CAwEAAaNQME4wHQYDVR0OBBYEFEVkjcLAITndky090Ay74QqCmQKIMB8GA1UdIwQYMBaAFEVkjcLAITndky090Ay74QqCmQKIMAwGA1UdEwQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAG4lYX3KQXenez4LpDnZhcFBEZi9YstUKPF5EKd+WplpVbcTQc1A3/Z+uHRmyV8h+pQzeF6Liob37G87YpacPplJI66cf2Rj7j8hSBNbdr+66E2qpcEhAF1iJmzBNyhb/ydlEuVpn8/EsoP+HvBeiDl5gon3562MzZIgV/pLdTfxHyW6hzAQhjGq2UhcvR+gXNVJvHP2eS4jlHnJkB9bfo0kvf87Q+D6XKX3q5c3mO8tqW6UpqHSC+uLEpzZiNLeuFa4TUIhgBgjDjlRrNDKu8ndancSn3yBHYnqJ2t9cR+coFnnjYABQpNrvk4mtmXY8SXoBzYG9Y+lqeAun6+0YyE=","encryption":"MIID7TCCAtWgAwIBAgIJANSq1uUtXl4DMA0GCSqGSIb3DQEBCwUAMFcxCzAJBgNVBAYTAkhLMRIwEAYDVQQIEwlIb25nIEtvbmcxFjAUBgNVBAoTDWV4cHJlc3Mtc2FtbDIxDDAKBgNVBAsTA2RldjEOMAwGA1UEAxMFZXNhbWwwHhcNMTUxMDAzMDM0ODA2WhcNMTgxMDAyMDM0ODA2WjBXMQswCQYDVQQGEwJISzESMBAGA1UECBMJSG9uZyBLb25nMRYwFAYDVQQKEw1leHByZXNzLXNhbWwyMQwwCgYDVQQLEwNkZXYxDjAMBgNVBAMTBWVzYW1sMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyx/yIgvJwfOCwMTNjL4Fslr21ky4O/uzxp0Y8wpHk9jk8Afcj3plQCr5X8dPKG2Rz4EIh//nQQL9tq2InaUdRwJkS9SeuuAcJG7DN/KDUtfrh4+cO2lZ4h7cQIdjpbBgpGEMhGy1wwpwHJsadoBuX0PKyT4O4oHkj1gwWO14qYnK4biviNBqmjGjmN+py+lUcACsQt22abA4s8Xjm/tlvnkgNRE3H44ICvSr8m5MVhyYGoAUe7Qprn2BcsMXd9mrlZ5hEdalNUDRbKb+W7mrKEkKFCbE3wi/Ns2bc4fbNXvwcZoF3/TPzl936u2eivTQESjCLsymIqdYHwRiVLifWQIDAQABo4G7MIG4MB0GA1UdDgQWBBSdBiMAVhKrjzd72sncR13imevq/DCBiAYDVR0jBIGAMH6AFJ0GIwBWEquPN3vaydxHXeKZ6+r8oVukWTBXMQswCQYDVQQGEwJISzESMBAGA1UECBMJSG9uZyBLb25nMRYwFAYDVQQKEw1leHByZXNzLXNhbWwyMQwwCgYDVQQLEwNkZXYxDjAMBgNVBAMTBWVzYW1sggkA1KrW5S1eXgMwDAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEARi25PJOR+x0ytYCmfXwG5LSXKNHx5BD6G+nBgXm1/DMMJ9ZY34FYMF3gDUu+NmQoVegqARTxetQcCICpAPdKnK0yQb6MXdj3VfQnEA+4hVGFmqnHTK90g0BudEmp1fWKBjJYpLd0oncVwJQJDK5OfS7fMUftN6/Kg6/fDuJMCNIECfKRE8tiXz2Ht924MjedKlH0+qoV1F2Fy5as+QRbj/QfrPTrZrfqhP04mavTPL2bdW6+ykeQWN3zMQtJA8kt2LI0y0CIGhFjLbqAceq+gDkp4drj7/Yw8qaqmxl6GP8w3GbfLu6mXCjCLCGgsATktvWq9dRfBuapaIpNDrv0NA=="}}');
  });
  test('get attirbute-innerText (kv) pair, multi values returns array composed of multi strings', t => {
    t.is(JSON.stringify(libsaml.extractor(_decodedResponse, [{
      localName: {
        tag: 'Attribute',
        key: 'Name',
      },
      valueTag: 'AttributeValue',
    }])), '{"attribute":{"uid":"test","mail":"test@example.com","eduPersonAffiliation":["users","examplerole1"]}}');
  });
  test('get attirbute-innerText (kv) pair, non-exist key returns undefined', t => {
    t.is(JSON.stringify(libsaml.extractor(SPMetadata.xmlString, [{
      localName: {
        tag: 'KeyDescriptor',
        key: 'used',
      },
      valueTag: 'X509Certificate',
    }]))['keydescriptor'] === undefined, true);

  });
  test('get attirbute-innerText (kv) pair, non-exist value returns undefined', t => {
    t.is(JSON.stringify(libsaml.extractor(SPMetadata.xmlString, [{
      localName: {
        tag: 'KeyDescriptor',
        key: 'use',
      },
      valueTag: 'X123Certificate',
    }]))['keydescriptor'] === undefined, true);
  });
  test('get attirbute-innerText (kv) pair, non-exist tag should return undefined', t => {
    t.is(JSON.stringify(libsaml.extractor(SPMetadata.xmlString, [{
      localName: {
        tag: 'KeyDescription',
        key: 'encrypt',
      },
      valueTag: 'X509Certificate',
    }]))['keydescriptor'] === undefined, true);
  });
  test('get attirbute-innerText (kv) pair, returns value with custom key', t => {
    t.is(JSON.stringify(libsaml.extractor(_decodedResponse, [{
      localName: {
        tag: 'Attribute',
        key: 'Name',
      },
      valueTag: 'AttributeValue',
      customKey: 'kd',
    }])['kd']), '{"uid":"test","mail":"test@example.com","eduPersonAffiliation":["users","examplerole1"]}');
  });

  test('get attirbutev1-attributev2 (kv) pair, single value returns array consisting one object', t => {
    t.is(JSON.stringify(libsaml.extractor(SPMetadata.xmlString, [{
      localName: { tag: 'AssertionConsumerService', key: 'isDefault' },
      attributeTag: 'index',
    }])['assertionconsumerservice']), '[{"true":"0"}]');
  });
  test('get attirbutev1-attributev2 (kv) pair, multi values returns array composed of multi objects', t => {
    t.is(JSON.stringify(libsaml.extractor(SPMetadata.xmlString, [{
      localName: {
        tag: 'SingleLogoutService',
        key: 'Binding',
      },
      attributeTag: 'Location',
    }])['singlelogoutservice']), '[{"urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect":"https://sp.example.org/sp/slo"},{"urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST":"https://sp.example.org/sp/slo"}]');
  });
  test('get attirbutev1-attributev2 (kv) pair, non-exist tag returns undefined', t => {
    t.is(JSON.stringify(libsaml.extractor(SPMetadata.xmlString, [{
      localName: {
        tag: 'SingleLogoutServices',
        key: 'Binding',
      },
      attributeTag: 'Location',
    }])['singlelogoutservice']) === undefined, true);
  });
  test('get attirbutev1-attributev2 (kv) pair, non-exist key returns undefined', t => {
    t.is(JSON.stringify(libsaml.extractor(SPMetadata.xmlString, [{
      localName: {
        tag: 'SingleLogoutService',
        key: 'Winding',
      },
      attributeTag: 'Location',
    }]))['singlelogoutservice'] === undefined, true);
  });
  test('get attirbutev1-attributev2 (kv) pair, non-exist attribute tag returns undefined', t => {
    t.is(JSON.stringify(libsaml.extractor(SPMetadata.xmlString, [{
      localName: {
        tag: 'SingleLogoutService',
        key: 'Binding',
      },
      attributeTag: 'NoSuchLocation',
    }]))['singlelogoutservice'] === undefined, true);
  });
  test('get attirbutev1-attributev2 (kv) pair, returns value with custom key', t => {
    t.is(JSON.stringify(libsaml.extractor(SPMetadata.xmlString, [{
      localName: {
        tag: 'SingleLogoutService',
        key: 'Binding',
      },
      attributeTag: 'Location',
      customKey: 'slo',
    }])['slo']), '[{"urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect":"https://sp.example.org/sp/slo"},{"urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST":"https://sp.example.org/sp/slo"}]');
  });

  test('encrypt assertion test passes', async t => {
    await t.notThrows(libsaml.encryptAssertion(idp, sp, sampleSignedResponse));
  });
  test('encrypt assertion response without assertion returns error', async t => {
    const error = await t.throws(libsaml.encryptAssertion(idp, sp, wrongResponse));
    t.is(error.message, 'undefined assertion or invalid syntax');
  });
  test('encrypt assertion with invalid xml syntax returns error', async t => {
    const error = await t.throws(libsaml.encryptAssertion(idp, sp, 'This is not a xml format string'));
    t.is(error.message, 'undefined assertion or invalid syntax');
  });
  test('encrypt assertion with empty string returns error', async t => {
    const error = await t.throws(libsaml.encryptAssertion(idp, sp, ''));
    t.is(error.message, 'empty or undefined xml string during encryption');
  });
  test('encrypt assertion with undefined string returns error', async t => {
    const error = await t.throws(libsaml.encryptAssertion(idp, sp, undefined));
    t.is(error.message, 'empty or undefined xml string during encryption');
  });
  test('building attribute statement with one attribute', t => {
    const attributes = [{
      name: 'email',
      valueTag: 'user.email',
      nameFormat: 'urn:oasis:names:tc:SAML:2.0:attrname-format:basic',
      valueXsiType: 'xs:string',
    }];
    t.is(libsaml.attributeStatementBuilder(attributes), '<saml:AttributeStatement><saml:Attribute Name="email" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic"><saml:AttributeValue xsi:type="xs:string">{attrUserEmail}</saml:AttributeValue></saml:Attribute></saml:AttributeStatement>');
  });
  test('building attribute statement with multiple attributes', t => {
    const attributes = [{
      name: 'email',
      valueTag: 'user.email',
      nameFormat: 'urn:oasis:names:tc:SAML:2.0:attrname-format:basic',
      valueXsiType: 'xs:string',
    }, {
      name: 'firstname',
      valueTag: 'user.firstname',
      nameFormat: 'urn:oasis:names:tc:SAML:2.0:attrname-format:basic',
      valueXsiType: 'xs:string',
    }];
    t.is(libsaml.attributeStatementBuilder(attributes), '<saml:AttributeStatement><saml:Attribute Name="email" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic"><saml:AttributeValue xsi:type="xs:string">{attrUserEmail}</saml:AttributeValue></saml:Attribute><saml:Attribute Name="firstname" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic"><saml:AttributeValue xsi:type="xs:string">{attrUserFirstname}</saml:AttributeValue></saml:Attribute></saml:AttributeStatement>');
  });
})();

(() => {
  const baseConfig = {
    signingCert: readFileSync('./test/key/sp/cert.cer'),
    privateKey: readFileSync('./test/key/sp/privkey.pem'),
    privateKeyPass: 'VHOSp5RUiBcrsjrcAuXFwU1NKCkGA8px',
    entityID: 'http://sp',
    nameIDFormat: ['urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'],
    assertionConsumerService: [{
      Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
      Location: 'http://sp/acs',
      Index: 1,
    }],
    singleLogoutService: [{
      Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
      Location: 'http://sp/slo',
      Index: 1,
    }],
  };
  test('sp metadata with default elements order', t => {
    t.is(serviceProvider(baseConfig).getMetadata(), '<EntityDescriptor entityID="http://sp" xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:assertion="urn:oasis:names:tc:SAML:2.0:assertion" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"><KeyDescriptor use="signing"><KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><X509Data><X509Certificate>MIIDozCCAougAwIBAgIJAKNsmL8QbfpwMA0GCSqGSIb3DQEBCwUAMGgxCzAJBgNVBAYTAkhLMRIwEAYDVQQIDAlIb25nIEtvbmcxCzAJBgNVBAcMAkhLMRMwEQYDVQQKDApub2RlLXNhbWwyMSMwIQYJKoZIhvcNAQkBFhRub2RlLnNhbWwyQGdtYWlsLmNvbTAeFw0xNTA3MDUxNzU2NDdaFw0xODA3MDQxNzU2NDdaMGgxCzAJBgNVBAYTAkhLMRIwEAYDVQQIDAlIb25nIEtvbmcxCzAJBgNVBAcMAkhLMRMwEQYDVQQKDApub2RlLXNhbWwyMSMwIQYJKoZIhvcNAQkBFhRub2RlLnNhbWwyQGdtYWlsLmNvbTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAMQJAB8JrsLQbUuJa8akzLqO1EZqClS0tQp+w+5wgufp07WwGn/shma8dcQNj1dbjszI5HBeVFjOKIxlfjmNB9ovhQPstBjP/UPQYp1Ip2IoHCYX9HDgMz3xyXKbHthUzZaECz+p+7WtgwhczRkBLDOm2k15qhPYGPw0vH2zbVRGWUBS9dy2Mp3tqlVbP0xZ9CDNkhCJkV9SMNfoCVW/VYPqK2QBo7ki4obm5x5ixFQSSHsKbVARVzyQH5iNjFe1TdAp3rDwrE5Lc1NQlQaxR5Gnb2NZApDORRZIVlNv2WUdi9QvM0yCzjQ90jP0OAogHhRYaxg0/vgNEye46h+PiY0CAwEAAaNQME4wHQYDVR0OBBYEFEVkjcLAITndky090Ay74QqCmQKIMB8GA1UdIwQYMBaAFEVkjcLAITndky090Ay74QqCmQKIMAwGA1UdEwQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAG4lYX3KQXenez4LpDnZhcFBEZi9YstUKPF5EKd+WplpVbcTQc1A3/Z+uHRmyV8h+pQzeF6Liob37G87YpacPplJI66cf2Rj7j8hSBNbdr+66E2qpcEhAF1iJmzBNyhb/ydlEuVpn8/EsoP+HvBeiDl5gon3562MzZIgV/pLdTfxHyW6hzAQhjGq2UhcvR+gXNVJvHP2eS4jlHnJkB9bfo0kvf87Q+D6XKX3q5c3mO8tqW6UpqHSC+uLEpzZiNLeuFa4TUIhgBgjDjlRrNDKu8ndancSn3yBHYnqJ2t9cR+coFnnjYABQpNrvk4mtmXY8SXoBzYG9Y+lqeAun6+0YyE=</X509Certificate></X509Data></KeyInfo></KeyDescriptor><NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat><SingleLogoutService index="0" Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="http://sp/slo"></SingleLogoutService><AssertionConsumerService index="0" Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="http://sp/acs"></AssertionConsumerService></SPSSODescriptor></EntityDescriptor>');
  });
  test('sp metadata with shibboleth elements order', t => {
    const spToShib = serviceProvider(assign(baseConfig, { elementsOrder: ref.elementsOrder.shibboleth }));
    t.is(spToShib.getMetadata(), '<EntityDescriptor entityID="http://sp" xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:assertion="urn:oasis:names:tc:SAML:2.0:assertion" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"><KeyDescriptor use="signing"><KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><X509Data><X509Certificate>MIIDozCCAougAwIBAgIJAKNsmL8QbfpwMA0GCSqGSIb3DQEBCwUAMGgxCzAJBgNVBAYTAkhLMRIwEAYDVQQIDAlIb25nIEtvbmcxCzAJBgNVBAcMAkhLMRMwEQYDVQQKDApub2RlLXNhbWwyMSMwIQYJKoZIhvcNAQkBFhRub2RlLnNhbWwyQGdtYWlsLmNvbTAeFw0xNTA3MDUxNzU2NDdaFw0xODA3MDQxNzU2NDdaMGgxCzAJBgNVBAYTAkhLMRIwEAYDVQQIDAlIb25nIEtvbmcxCzAJBgNVBAcMAkhLMRMwEQYDVQQKDApub2RlLXNhbWwyMSMwIQYJKoZIhvcNAQkBFhRub2RlLnNhbWwyQGdtYWlsLmNvbTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAMQJAB8JrsLQbUuJa8akzLqO1EZqClS0tQp+w+5wgufp07WwGn/shma8dcQNj1dbjszI5HBeVFjOKIxlfjmNB9ovhQPstBjP/UPQYp1Ip2IoHCYX9HDgMz3xyXKbHthUzZaECz+p+7WtgwhczRkBLDOm2k15qhPYGPw0vH2zbVRGWUBS9dy2Mp3tqlVbP0xZ9CDNkhCJkV9SMNfoCVW/VYPqK2QBo7ki4obm5x5ixFQSSHsKbVARVzyQH5iNjFe1TdAp3rDwrE5Lc1NQlQaxR5Gnb2NZApDORRZIVlNv2WUdi9QvM0yCzjQ90jP0OAogHhRYaxg0/vgNEye46h+PiY0CAwEAAaNQME4wHQYDVR0OBBYEFEVkjcLAITndky090Ay74QqCmQKIMB8GA1UdIwQYMBaAFEVkjcLAITndky090Ay74QqCmQKIMAwGA1UdEwQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAG4lYX3KQXenez4LpDnZhcFBEZi9YstUKPF5EKd+WplpVbcTQc1A3/Z+uHRmyV8h+pQzeF6Liob37G87YpacPplJI66cf2Rj7j8hSBNbdr+66E2qpcEhAF1iJmzBNyhb/ydlEuVpn8/EsoP+HvBeiDl5gon3562MzZIgV/pLdTfxHyW6hzAQhjGq2UhcvR+gXNVJvHP2eS4jlHnJkB9bfo0kvf87Q+D6XKX3q5c3mO8tqW6UpqHSC+uLEpzZiNLeuFa4TUIhgBgjDjlRrNDKu8ndancSn3yBHYnqJ2t9cR+coFnnjYABQpNrvk4mtmXY8SXoBzYG9Y+lqeAun6+0YyE=</X509Certificate></X509Data></KeyInfo></KeyDescriptor><SingleLogoutService index="0" Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="http://sp/slo"></SingleLogoutService><NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat><AssertionConsumerService index="0" Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="http://sp/acs"></AssertionConsumerService></SPSSODescriptor></EntityDescriptor>');
  });

})();

test('verify time', t => {
  let timeAfter5Mins = new Date();
  let timeBefore5Mins = new Date();
  timeBefore5Mins = new Date(timeBefore5Mins.setMinutes(timeBefore5Mins.getMinutes() - 5));
  timeAfter5Mins = new Date(timeAfter5Mins.setMinutes(timeAfter5Mins.getMinutes() + 5));
  t.true(sp.verifyTime(timeBefore5Mins, timeAfter5Mins));
  t.false(sp.verifyTime(undefined, timeBefore5Mins));
  t.false(sp.verifyTime(timeAfter5Mins));
  t.true(sp.verifyTime());
});

test('metadata with multiple entity descriptors is invalid', t => {
  try {
    identityProvider({ ...defaultIdpConfig, metadata: './test/misc/multiple_entitydescriptor' });
    t.fail();
  } catch ({ message }) {
    t.is(message, 'metadata must contain exactly one entity descriptor');
  }
});

test('undefined x509 key in metadata should throw error', t => {
  try {
    idp.entityMeta.getX509Certificate('undefined');
    t.fail();
  } catch ({ message }) {
    t.is(message, 'undefined use of key in getX509Certificate');
  }
  try {
    sp.entityMeta.getX509Certificate('undefined');
    t.fail();
  } catch ({ message }) {
    t.is(message, 'undefined use of key in getX509Certificate');
  }
});

test('get name id format in metadata', t => {
  t.is(Array.isArray(idp.entityMeta.getNameIDFormat()), true);
  t.is(sp.entityMeta.getNameIDFormat(), 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress');
});

test('get entity setting', t => {
  t.is(typeof idp.getEntitySetting(), 'object');
  t.is(typeof sp.getEntitySetting(), 'object');
});
