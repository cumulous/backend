export function testEmpty(array: any[], name: string) {
  if (!array || array.length === 0) {
    throw Error('Expected non-empty ' + name + '[]');
  }
}