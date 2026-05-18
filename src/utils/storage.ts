import { TypedMap } from '@graphprotocol/graph-ts';

const temporaryStorage = new TypedMap<string, string | null>();

export function setItemInStorage(key: string, value: string): string {
    temporaryStorage.set(key, value);
    return value;
}

export function getItemFromStorage(key: string): string | null {
    return temporaryStorage.get(key);
}

export function nullifyItem(key: string): void {
    temporaryStorage.set(key, null);
}
