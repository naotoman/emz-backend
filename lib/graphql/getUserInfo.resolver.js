export function request(ctx) {
  return {
    operation: "GetItem",
    key: { id: { S: `USER#${ctx.identity.username}` } },
  };
}

export function response(ctx) {
  return ctx.result;
}
