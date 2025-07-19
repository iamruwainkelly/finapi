// boolify function
export const boolify = (value: any): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value);
};

// fn to log text, but include the current method name automatically
// add timestamp to the log
export const l = (file: string, method: string, text: string) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${file}][${method}] ${text}`);
};
