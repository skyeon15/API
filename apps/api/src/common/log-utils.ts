const MAX_BODY_STRING_LENGTH = 500;
const MAX_ARRAY_PREVIEW = 3;

export function truncateBody(data: any, depth = 0): any {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    const preview = data
      .slice(0, MAX_ARRAY_PREVIEW)
      .map((item) => truncateBody(item, depth + 1));
    if (data.length > MAX_ARRAY_PREVIEW) {
      return [...preview, `... (${data.length - MAX_ARRAY_PREVIEW} more)`];
    }
    return preview;
  }

  if (typeof data === 'object' && depth < 3) {
    const result: any = {};
    for (const key of Object.keys(data)) {
      result[key] = truncateBody(data[key], depth + 1);
    }
    return result;
  }

  if (typeof data === 'string' && data.length > MAX_BODY_STRING_LENGTH) {
    return (
      data.slice(0, MAX_BODY_STRING_LENGTH) +
      `... (${data.length - MAX_BODY_STRING_LENGTH} more chars)`
    );
  }

  return data;
}
