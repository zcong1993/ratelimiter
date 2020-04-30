import { Group } from '../src/group'

it('group should works well', () => {
  const mockRes = 'test'
  const newFunc = jest.fn<string, any>().mockReturnValue(mockRes)

  const g = new Group(newFunc)
  expect(g.get('key1')).toBe(mockRes)
  expect(newFunc).toBeCalledTimes(1)
  expect(g.get('key1')).toBe(mockRes)
  expect(newFunc).toBeCalledTimes(1)

  expect(g.get('key2')).toBe(mockRes)
  expect(newFunc).toBeCalledTimes(2)

  g.reset()
  expect(g.get('key1')).toBe(mockRes)
  expect(newFunc).toBeCalledTimes(3)
})
