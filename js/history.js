const DB_NAME = "ld76-code-agent";
const DB_VERSION = 1;
const STORE_NAME = "messages";
const ACTIVE_CONVERSATION_KEY =
  "ld76_active_conversation_id";

let databasePromise = null;

export function createConversationId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `chat-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export function getActiveConversationId() {
  try {
    return (
      localStorage.getItem(
        ACTIVE_CONVERSATION_KEY
      ) || ""
    ).trim();
  } catch (error) {
    console.error(
      "Failed to read active conversation ID:",
      error
    );

    return "";
  }
}

export function setActiveConversationId(
  conversationId
) {
  const cleanId =
    String(conversationId || "").trim();

  if (!cleanId) {
    return;
  }

  try {
    localStorage.setItem(
      ACTIVE_CONVERSATION_KEY,
      cleanId
    );
  } catch (error) {
    console.error(
      "Failed to save active conversation ID:",
      error
    );
  }
}

export function startNewConversation() {
  const conversationId =
    createConversationId();

  setActiveConversationId(
    conversationId
  );

  return conversationId;
}

export async function saveMessage({
  conversationId,
  role,
  content,
  metadata = null
}) {
  const cleanConversationId =
    String(conversationId || "").trim();

  const cleanRole =
    normalizeRole(role);

  const cleanContent =
    String(content ?? "").trim();

  if (
    !cleanConversationId ||
    !cleanRole ||
    !cleanContent
  ) {
    return null;
  }

  const message = {
    id: createMessageId(),
    conversationId:
      cleanConversationId,
    role: cleanRole,
    content: cleanContent,
    metadata:
      metadata &&
      typeof metadata === "object"
        ? metadata
        : null,
    createdAt: Date.now()
  };

  const db = await openDatabase();

  await transaction(
    db,
    "readwrite",
    (store) => {
      store.put(message);
    }
  );

  return message;
}

export async function getConversationMessages(
  conversationId
) {
  const cleanConversationId =
    String(conversationId || "").trim();

  if (!cleanConversationId) {
    return [];
  }

  const db = await openDatabase();

  const messages =
    await transaction(
      db,
      "readonly",
      (store) => {
        const index =
          store.index("conversationId");

        return requestToPromise(
          index.getAll(
            cleanConversationId
          )
        );
      }
    );

  return Array.isArray(messages)
    ? messages.sort(
        (a, b) =>
          Number(a.createdAt || 0) -
          Number(b.createdAt || 0)
      )
    : [];
}

export async function getRecentMessages(
  conversationId,
  limit = 30
) {
  const messages =
    await getConversationMessages(
      conversationId
    );

  const safeLimit =
    Math.max(
      1,
      Math.min(
        Number(limit) || 30,
        100
      )
    );

  return messages.slice(
    -safeLimit
  );
}

export async function deleteConversation(
  conversationId
) {
  const cleanConversationId =
    String(conversationId || "").trim();

  if (!cleanConversationId) {
    return;
  }

  const db = await openDatabase();

  const messages =
    await getConversationMessages(
      cleanConversationId
    );

  await transaction(
    db,
    "readwrite",
    (store) => {
      for (const message of messages) {
        store.delete(message.id);
      }
    }
  );
}

export async function clearAllHistory() {
  const db = await openDatabase();

  await transaction(
    db,
    "readwrite",
    (store) => {
      store.clear();
    }
  );

  try {
    localStorage.removeItem(
      ACTIVE_CONVERSATION_KEY
    );
  } catch (error) {
    console.error(
      "Failed to clear active conversation ID:",
      error
    );
  }
}

export async function getConversationIds() {
  const db = await openDatabase();

  const messages =
    await transaction(
      db,
      "readonly",
      (store) =>
        requestToPromise(
          store.getAll()
        )
    );

  const ids = new Set();

  if (Array.isArray(messages)) {
    messages.forEach((message) => {
      if (message?.conversationId) {
        ids.add(
          message.conversationId
        );
      }
    });
  }

  return [...ids];
}

export function messagesToGeminiHistory(
  messages
) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter(
      (message) =>
        message &&
        (message.role === "user" ||
          message.role === "assistant") &&
        typeof message.content ===
          "string" &&
        message.content.trim()
    )
    .map((message) => ({
      role:
        message.role === "assistant"
          ? "model"
          : "user",
      parts: [
        {
          text:
            message.content.trim()
        }
      ]
    }));
}

function normalizeRole(role) {
  const value =
    String(role || "")
      .trim()
      .toLowerCase();

  if (
    value === "user" ||
    value === "assistant" ||
    value === "system" ||
    value === "error"
  ) {
    return value;
  }

  return "system";
}

function createMessageId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function openDatabase() {
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise =
    new Promise(
      (resolve, reject) => {
        if (
          typeof indexedDB ===
          "undefined"
        ) {
          reject(
            new Error(
              "IndexedDB is not available in this browser."
            )
          );

          return;
        }

        const request =
          indexedDB.open(
            DB_NAME,
            DB_VERSION
          );

        request.onupgradeneeded =
          () => {
            const db =
              request.result;

            let store;

            if (
              db.objectStoreNames.contains(
                STORE_NAME
              )
            ) {
              store =
                request.transaction.objectStore(
                  STORE_NAME
                );
            } else {
              store =
                db.createObjectStore(
                  STORE_NAME,
                  {
                    keyPath: "id"
                  }
                );
            }

            if (
              !store.indexNames.contains(
                "conversationId"
              )
            ) {
              store.createIndex(
                "conversationId",
                "conversationId",
                {
                  unique: false
                }
              );
            }

            if (
              !store.indexNames.contains(
                "createdAt"
              )
            ) {
              store.createIndex(
                "createdAt",
                "createdAt",
                {
                  unique: false
                }
              );
            }
          };

        request.onsuccess =
          () => {
            const db =
              request.result;

            db.onversionchange =
              () => {
                db.close();
                databasePromise =
                  null;
              };

            resolve(db);
          };

        request.onerror =
          () => {
            databasePromise = null;

            reject(
              request.error ||
                new Error(
                  "Failed to open chat history database."
                )
            );
          };

        request.onblocked =
          () => {
            reject(
              new Error(
                "Chat history database is blocked."
              )
            );
          };
      }
    );

  return databasePromise;
}

function transaction(
  db,
  mode,
  operation
) {
  return new Promise(
    (resolve, reject) => {
      let result;
      let transactionObject;

      try {
        transactionObject =
          db.transaction(
            STORE_NAME,
            mode
          );

        const store =
          transactionObject.objectStore(
            STORE_NAME
          );

        result =
          operation(store);

        transactionObject.oncomplete =
          () => {
            resolve(result);
          };

        transactionObject.onerror =
          () => {
            reject(
              transactionObject.error ||
                new Error(
                  "Chat history transaction failed."
                )
            );
          };

        transactionObject.onabort =
          () => {
            reject(
              transactionObject.error ||
                new Error(
                  "Chat history transaction was aborted."
                )
            );
          };
      } catch (error) {
        reject(error);
      }
    }
  );
}

function requestToPromise(
  request
) {
  return new Promise(
    (resolve, reject) => {
      request.onsuccess =
        () => {
          resolve(
            request.result
          );
        };

      request.onerror =
        () => {
          reject(
            request.error ||
              new Error(
                "IndexedDB request failed."
              )
          );
        };
    }
  );
}
