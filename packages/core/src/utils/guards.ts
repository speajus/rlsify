export type Guard<T> = (value: unknown) => value is T;

export function keysOf<T>(obj: T):(keyof T)[] {
  return isObject(obj) ? Object.keys(obj) as (keyof T)[] : []
}

export function hasKey<K extends PropertyKey[]>(obj: unknown, ...keys: K): obj is Record<K[number], unknown> {
  return isObject(obj) && keys.every(k => k in obj);
}

export function hasKeyOf<K extends PropertyKey, V>(obj: unknown, 
  k: K, g:Guard<V>): obj is Record<K, V> {
  return hasKey(obj, k) && g(obj[k]);
}
export function isObject(obj: unknown): obj is Record<PropertyKey, unknown> {
  return obj != null && (typeof obj === 'object' || typeof obj === 'function');
}
export function isDefined<T>(value: T): value is Exclude<T, null | undefined> {
  return value != null;
}
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}
export function isArrayOf<T>(value: unknown, g: Guard<T>): value is T[] {
  return isArray(value) && value.every(g);
}
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}
export function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}
export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

export function isPrimitive(value: unknown): value is string | number | boolean {
  return isString(value) || isNumber(value) || isBoolean(value);
}
export function isSymbol(value: unknown): value is symbol {
  return typeof value === 'symbol';
}

export function isExact<T>(v:unknown, c: T): v is T {
  return v === c;
}

export function isUniqueSymbol<T extends symbol>(value: unknown, sym: T): value is T {
  return isSymbol(value) && value === sym;
}

export function isPropertyKey(value: unknown): value is PropertyKey {
  return isString(value) || isNumber(value) || isSymbol(value);
}

export function isShape<T>(value: unknown, g: { [K in keyof T]: Guard<T[K]> }): value is T {
  return isObject(value) && keysOf(g).every((k) => hasKeyOf(value, k, g[k]!));
}

export function shape<T>(g: { [K in keyof T]: Guard<T[K]> }): Guard<T> {
  return (value: unknown): value is T => isShape(value, g);
}

export function optional<T>(g: Guard<T>): Guard<T | null | undefined> {
  return (value: unknown): value is T | null | undefined => value == null || g(value);
}

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export function isJson(value: unknown): value is Json {
  return value === null || isPrimitive(value) || isArrayOf(value, isJson) || isObject(value) && Object.values(value).every(isJson);
}

