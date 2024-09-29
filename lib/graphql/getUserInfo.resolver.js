export function request(ctx) {
  return {
    operation: "GetItem",
    key: { id: { S: `user#${ctx.identity.username}` } },
  };
}

export function response(ctx) {
  return ctx.result;
}
