const { randomUUID } = require("node:crypto");
function memoryQueue() {
  const tables = {};
  const names = [
    "filmWorkspace",
    "filmReference",
    "filmSceneRevision",
    "filmSceneThread",
    "filmSceneJob",
    "filmSceneSlot",
  ];
  const db = {};
  const clone = (value) =>
    value === undefined ? undefined : structuredClone(value);
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (value === undefined) return true;
      if (
        !(key in row) &&
        key.includes("_") &&
        value &&
        typeof value === "object"
      )
        return matches(row, value);
      if (value && typeof value === "object" && !(value instanceof Date)) {
        if ("in" in value) return value.in.includes(row[key]);
        if ("not" in value) return row[key] !== value.not;
        if ("lt" in value) return row[key] < value.lt;
        if ("gt" in value) return row[key] > value.gt;
      }
      return row[key] === value;
    });
  }
  function change(row, data) {
    for (const [key, value] of Object.entries(data))
      if (value !== undefined)
        row[key] =
          value && typeof value === "object" && "increment" in value
            ? row[key] + value.increment
            : clone(value);
    row.updatedAt = new Date();
    return clone(row);
  }
  for (const name of names) {
    tables[name] = new Map();
    const model = {
      findMany: async ({ where, orderBy, take } = {}) => {
        let result = [...tables[name].values()].filter((row) =>
          matches(row, where),
        );
        if (orderBy) {
          const [key, order] = Object.entries(orderBy)[0];
          result.sort(
            (a, b) =>
              (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) *
              (order === "desc" ? -1 : 1),
          );
        }
        return clone(take ? result.slice(0, take) : result);
      },
      findFirst: async (args) => (await model.findMany(args))[0] || null,
      findUnique: async (args) => model.findFirst(args),
      findUniqueOrThrow: async (args) => {
        const row = await model.findFirst(args);
        if (!row) throw new Error("Record missing");
        return row;
      },
      count: async (args) => (await model.findMany(args)).length,
      create: async ({ data }) => {
        if (
          name === "filmSceneJob" &&
          [...tables[name].values()].some(
            (row) =>
              row.workspaceId === data.workspaceId &&
              row.requestId === data.requestId,
          )
        )
          throw Object.assign(new Error("Duplicate"), { code: "P2002" });
        const row = {
          id: randomUUID(),
          revision: 0,
          status: "queued",
          phase: "prepare",
          sequence: 0,
          attempts: 0,
          cancelRequested: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...clone(data),
        };
        tables[name].set(row.id, row);
        return clone(row);
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const row of tables[name].values())
          if (matches(row, where)) {
            change(row, data);
            count++;
          }
        return { count };
      },
      update: async ({ where, data }) => {
        const row = [...tables[name].values()].find((row) =>
          matches(row, where),
        );
        if (!row) throw new Error("Update missing");
        return change(row, data);
      },
      upsert: async ({ where, create, update }) => {
        const row = [...tables[name].values()].find((row) =>
          matches(row, where),
        );
        return row ? change(row, update) : model.create({ data: create });
      },
    };
    db[name] = model;
  }
  for (const id of [1, 2, 3])
    tables.filmSceneSlot.set(id, {
      id,
      jobId: null,
      token: null,
      leaseUntil: new Date(0),
    });
  let gate = Promise.resolve();
  db.$transaction = (fn) => {
    const run = gate.then(() => fn(db));
    gate = run.catch(() => {});
    return run;
  };
  db.$queryRaw = async (parts, ...values) =>
    parts.join("").includes('FROM "FilmSceneSlot"')
      ? [clone(tables.filmSceneSlot.get(values[0]))]
      : [];
  return { db, tables };
}
module.exports = { memoryQueue };
