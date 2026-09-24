import { Account, Client, Databases, ID } from 'appwrite';

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
const databaseId = import.meta.env.VITE_APPWRITE_DATABASE_ID;
const collectionId = import.meta.env.VITE_APPWRITE_COLLECTION_ID;

export const appwriteConfigured = Boolean(projectId && databaseId && collectionId);

const client = new Client().setEndpoint(endpoint).setProject(projectId || 'not-configured');
const account = new Account(client);
const databases = new Databases(client);
let sessionReady;

async function ensureAppwrite() {
  if (!appwriteConfigured) return false;
  sessionReady ||= account.createAnonymousSession().catch(async (error) => {
    if (error?.code === 409) return account.get();
    throw error;
  });
  await sessionReady;
  return true;
}

export async function loadSessionsFromAppwrite() {
  if (!(await ensureAppwrite())) return null;
  const response = await databases.listDocuments(databaseId, collectionId);
  return response.documents.map(({ $id, employee, clockedInAt, clockedOutAt }) => ({
    id: $id,
    employee,
    clockedInAt,
    clockedOutAt: clockedOutAt || null,
  }));
}

export async function saveSessionsToAppwrite(sessions) {
  if (!(await ensureAppwrite())) return;
  await Promise.all(sessions.map(async (session) => {
    const data = {
      employee: session.employee,
      clockedInAt: session.clockedInAt,
      clockedOutAt: session.clockedOutAt || '',
    };
    try {
      await databases.updateDocument(databaseId, collectionId, session.id, data);
    } catch (error) {
      if (error?.code !== 404) throw error;
      await databases.createDocument(databaseId, collectionId, session.id || ID.unique(), data);
    }
  }));
}