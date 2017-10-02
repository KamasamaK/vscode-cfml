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
