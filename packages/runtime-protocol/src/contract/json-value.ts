export type RuntimeJsonPrimitive = boolean | number | string | null

export type RuntimeJsonValue =
  | RuntimeJsonPrimitive
  | RuntimeJsonValue[]
  | { [key: string]: RuntimeJsonValue }
