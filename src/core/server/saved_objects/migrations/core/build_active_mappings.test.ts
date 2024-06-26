/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Any modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { IndexMapping, SavedObjectsTypeMappingDefinitions } from './../../mappings';
import { buildActiveMappings, diffMappings } from './build_active_mappings';
import { configMock } from '../../../config/mocks';

describe('buildActiveMappings', () => {
  test('creates a strict mapping', () => {
    const mappings = buildActiveMappings({});
    expect(mappings.dynamic).toEqual('strict');
  });

  test('combines all mappings and includes core mappings', () => {
    const properties = {
      aaa: { type: 'text' },
      bbb: { type: 'long' },
    } as const;

    expect(buildActiveMappings(properties)).toMatchSnapshot();
  });

  test('disallows duplicate mappings', () => {
    const properties = { type: { type: 'long' } } as const;

    expect(() => buildActiveMappings(properties)).toThrow(/Cannot redefine core mapping \"type\"/);
  });

  test('disallows mappings with leading underscore', () => {
    const properties = { _hm: { type: 'keyword' } } as const;

    expect(() => buildActiveMappings(properties)).toThrow(
      /Invalid mapping \"_hm\"\. Mappings cannot start with _/
    );
  });

  test('handles the `dynamic` property of types', () => {
    const typeMappings: SavedObjectsTypeMappingDefinitions = {
      firstType: {
        dynamic: 'strict',
        properties: { field: { type: 'keyword' } },
      },
      secondType: {
        dynamic: false,
        properties: { field: { type: 'long' } },
      },
      thirdType: {
        properties: { field: { type: 'text' } },
      },
    };
    expect(buildActiveMappings(typeMappings)).toMatchSnapshot();
  });

  test('generated hashes are stable', () => {
    const properties = {
      aaa: { type: 'keyword', fields: { a: { type: 'keyword' }, b: { type: 'text' } } },
      bbb: { fields: { b: { type: 'text' }, a: { type: 'keyword' } }, type: 'keyword' },
      ccc: { fields: { b: { type: 'text' }, a: { type: 'text' } }, type: 'keyword' },
    } as const;

    const mappings = buildActiveMappings(properties);
    const hashes = mappings._meta!.migrationMappingPropertyHashes!;

    expect(hashes.aaa).toBeDefined();
    expect(hashes.aaa).toEqual(hashes.bbb);
    expect(hashes.aaa).not.toEqual(hashes.ccc);
  });

  test('permissions field is added when permission control flag is enabled', () => {
    const rawConfig = configMock.create();
    rawConfig.get.mockReturnValue(true);
    expect(buildActiveMappings({}, rawConfig)).toHaveProperty('properties.permissions');
  });

  test('workspaces field is added when workspace feature flag is enabled', () => {
    const rawConfig = configMock.create();
    rawConfig.get.mockReturnValue(true);
    expect(buildActiveMappings({}, rawConfig)).toHaveProperty('properties.workspaces');
  });
});

describe('diffMappings', () => {
  test('is different if expected contains extra hashes', () => {
    const actual: IndexMapping = {
      _meta: {
        migrationMappingPropertyHashes: { foo: 'bar' },
      },
      dynamic: 'strict',
      properties: {},
    };
    const expected: IndexMapping = {
      _meta: {
        migrationMappingPropertyHashes: { foo: 'bar', baz: 'qux' },
      },
      dynamic: 'strict',
      properties: {},
    };

    expect(diffMappings(actual, expected)!.changedProp).toEqual('properties.baz');
  });

  test('does nothing if actual contains extra hashes', () => {
    const actual: IndexMapping = {
      _meta: {
        migrationMappingPropertyHashes: { foo: 'bar', baz: 'qux' },
      },
      dynamic: 'strict',
      properties: {},
    };
    const expected: IndexMapping = {
      _meta: {
        migrationMappingPropertyHashes: { foo: 'bar' },
      },
      dynamic: 'strict',
      properties: {},
    };

    expect(diffMappings(actual, expected)).toBeUndefined();
  });

  test('does nothing if actual hashes are identical to expected, but properties differ', () => {
    const actual: IndexMapping = {
      _meta: {
        migrationMappingPropertyHashes: { foo: 'bar' },
      },
      dynamic: 'strict',
      properties: {
        foo: { type: 'keyword' },
      },
    };
    const expected: IndexMapping = {
      _meta: {
        migrationMappingPropertyHashes: { foo: 'bar' },
      },
      dynamic: 'strict',
      properties: {
        foo: { type: 'text' },
      },
    };

    expect(diffMappings(actual, expected)).toBeUndefined();
  });

  test('is different if meta hashes change', () => {
    const actual: IndexMapping = {
      _meta: {
        migrationMappingPropertyHashes: { foo: 'bar' },
      },
      dynamic: 'strict',
      properties: {},
    };
    const expected: IndexMapping = {
      _meta: {
        migrationMappingPropertyHashes: { foo: 'baz' },
      },
      dynamic: 'strict',
      properties: {},
    };

    expect(diffMappings(actual, expected)!.changedProp).toEqual('properties.foo');
  });

  test('is different if dynamic is different', () => {
    const actual: IndexMapping = {
      _meta: {
        migrationMappingPropertyHashes: { foo: 'bar' },
      },
      dynamic: 'strict',
      properties: {},
    };
    const expected: IndexMapping = {
      _meta: {
        migrationMappingPropertyHashes: { foo: 'bar' },
      },
      // @ts-expect-error dynamic accepts boolean | "strict" | undefined. error is expected for test purpose.
      dynamic: 'abcde',
      properties: {},
    };

    expect(diffMappings(actual, expected)!.changedProp).toEqual('dynamic');
  });

  test('is different if migrationMappingPropertyHashes is missing from actual', () => {
    const actual: IndexMapping = {
      _meta: {},
      dynamic: 'strict',
      properties: {},
    };
    const expected: IndexMapping = {
      _meta: {
        migrationMappingPropertyHashes: { foo: 'bar' },
      },
      dynamic: 'strict',
      properties: {},
    };

    expect(diffMappings(actual, expected)!.changedProp).toEqual('_meta');
  });

  test('is different if _meta is missing from actual', () => {
    const actual: IndexMapping = {
      dynamic: 'strict',
      properties: {},
    };
    const expected: IndexMapping = {
      _meta: {
        migrationMappingPropertyHashes: { foo: 'bar' },
      },
      dynamic: 'strict',
      properties: {},
    };

    expect(diffMappings(actual, expected)!.changedProp).toEqual('_meta');
  });
});
