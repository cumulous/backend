export const assertNonEmptyArray = (array: any[], name: string) => {
  if (!Array.isArray(array) || array.length === 0) {
    throw Error('Expected non-empty ' + name + '[]');
  }
};
