/**
* @file metadata-idp.ts
* @author tngan
* @desc  Metadata of identity provider
*/
import Metadata, { MetadataInterface } from './metadata';
import { namespace } from './urn';
import libsaml from './libsaml';
import { isString, isUndefined } from 'lodash';
import { isNonEmptyArray } from './utility';
import * as xml from 'xml';

export interface IdpMetadataInterface extends MetadataInterface {

}

/*
 * @desc interface function
 */
export default function(meta) {
  return new IdpMetadata(meta);
}

export class IdpMetadata extends Metadata {

  constructor(meta) {

    const isFile = isString(meta) || meta instanceof Buffer;

    if (!isFile) {

      const {
        entityID,
        signingCert,
        encryptCert,
        wantAuthnRequestsSigned = false,
        nameIDFormat = [],
        singleSignOnService = [],
        singleLogoutService = [],
      } = meta;

      const IDPSSODescriptor: any[] = [{
        _attr: {
          WantAuthnRequestsSigned: String(wantAuthnRequestsSigned),
          protocolSupportEnumeration: namespace.names.protocol,
        },
      }];

      if (signingCert) {
        IDPSSODescriptor.push(libsaml.createKeySection('signing', signingCert));
      } else {
        //console.warn('Construct identity provider - missing signing certificate');
      }

      if (encryptCert) {
        IDPSSODescriptor.push(libsaml.createKeySection('encrypt', encryptCert));
      } else {
        //console.warn('Construct identity provider - missing encrypt certificate');
      }

      if (isNonEmptyArray(nameIDFormat)) {
        nameIDFormat.forEach(f => IDPSSODescriptor.push({ NameIDFormat: f }));
      }

      if (isNonEmptyArray(singleSignOnService)) {
        let indexCount = 0;
        singleSignOnService.forEach(a => {
          const attr: any = {
            index: String(indexCount++),
            Binding: a.Binding,
            Location: a.Location,
          };
          if (a.isDefault) {
            attr.isDefault = true;
          }
          IDPSSODescriptor.push({ SingleSignOnService: [{ _attr: attr }] });
        });
      } else {
        throw new Error('Missing endpoint of SingleSignOnService');
      }

      if (isNonEmptyArray(singleLogoutService)) {
        let indexCount = 0;
        singleLogoutService.forEach(a => {
          const attr: any = {};
          if (a.isDefault) {
            attr.isDefault = true;
          }
          attr.index = (indexCount++).toString();
          attr.Binding = a.Binding;
          attr.Location = a.Location;
          IDPSSODescriptor.push({ SingleLogoutService: [{ _attr: attr }] });
        });
      } else {
        console.warn('Construct identity  provider - missing endpoint of SingleLogoutService');
      }
      // Create a new metadata by setting
      meta = xml([{
        EntityDescriptor: [{
          _attr: {
            'xmlns:md': namespace.names.metadata,
            'xmlns:assertion': namespace.names.assertion,
            'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
            entityID,
          },
        }, { IDPSSODescriptor }],
      }]);
    }

    super(meta, [
      {
        localName: 'IDPSSODescriptor',
        attributes: ['WantAuthnRequestsSigned'],
      },
      {
        localName: { tag: 'SingleSignOnService', key: 'Binding' },
        attributeTag: 'Location',
      },
    ]);

  }

  /**
  * @desc Get the preference whether it wants a signed request
  * @return {boolean} WantAuthnRequestsSigned
  */
  isWantAuthnRequestsSigned(): boolean {
    const was = this.meta.idpssodescriptor.wantauthnrequestssigned;
    if (isUndefined(was)) {
      return false;
    }
    return String(was) === 'true';
  }

  /**
  * @desc Get the entity endpoint for single sign on service
  * @param  {string} binding      protocol binding (e.g. redirect, post)
  * @return {string/object} location
  */
  getSingleSignOnService(binding: string): string | object {
    if (isString(binding)) {
      const bindName = namespace.binding[binding];
      const service = this.meta.singlesignonservice.find(obj => obj[bindName]);
      if (service) {
        return service[bindName];
      }
    }
    return this.meta.singlesignonservice;
  }
}
