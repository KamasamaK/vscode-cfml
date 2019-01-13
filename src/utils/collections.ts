import { equalsIgnoreCase } from "./textUtil";

export class MyMap<K, V> extends Map<K, V> {
  public filter(callbackfn: (value: V, key: K, map: MyMap<K, V>) => boolean): MyMap<K, V> {
    let myMap = new MyMap<K, V>();
    this.forEach((value: V, key: K, map: MyMap<K, V>) => {
      if (callbackfn(value, key, map)) {
        myMap.set(key, value);
      }
    });

    return myMap;
  }
}

export class MySet<T> extends Set<T> {
  public filter(callbackfn: (value: T, value2: T, set: MySet<T>) => boolean): MySet<T> {
    let mySet = new MySet<T>();
    this.forEach((value: T, value2: T, set: MySet<T>) => {
      if (callbackfn(value, value2, set)) {
        mySet.add(value);
      }
    });

    return mySet;
  }
}

export function stringArrayIncludesIgnoreCase(arr: string[], item: string): boolean {
  return arr.some((val: string) => {
    return equalsIgnoreCase(val, item);
  });
}

// TODO: Find a better place for this
export interface NameWithOptionalValue<T> {
  name: string;
  value?: T;
}

// TODO: Find a better place for this
export enum SearchMode {
  StartsWith,
  Contains,
  EqualTo,
}
