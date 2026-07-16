import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

const missingAppId = !appId || appId === "null" || appId === "undefined";

const sdkClient = missingAppId
  ? {}
  : createClient({
      appId,
      token,
      functionsVersion,
      serverUrl: '',
      requiresAuth: false,
      appBaseUrl
    });

const warnMissingAppId = (operation) => {
  console.warn(
    `[Tá Barato] ${operation} não executado: configure VITE_BASE44_APP_ID no ambiente de produção.`
  );
};

const emptyEntity = {
  list: async () => [],
  filter: async () => [],
  get: async () => null,
  create: async () => {
    warnMissingAppId("create");
    return null;
  },
  update: async () => {
    warnMissingAppId("update");
    return null;
  },
  delete: async () => {
    warnMissingAppId("delete");
    return null;
  },
  bulkUpdate: async () => {
    warnMissingAppId("bulkUpdate");
    return [];
  },
};

export const isDataConfigured = !missingAppId;

export const base44 = /** @type {any} */ (missingAppId
  ? {
      ...sdkClient,
      entities: new Proxy({}, {
        get: (_target, entityName) => {
          warnMissingAppId(`entities.${String(entityName)}`);
          return emptyEntity;
        },
      }),
      auth: {
        me: async () => null,
        logout: () => {},
        redirectToLogin: () => {},
      },
    }
  : sdkClient);
