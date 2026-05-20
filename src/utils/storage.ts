import { EphemeralStorage } from '../../generated/schema';
import { log } from 'matchstick-as';

export function setItemInStorage(key: string, value: string): string {
    log.debug('[storage] setItemInStorage — key: {}, value: {}', [key, value]);
    let storage = EphemeralStorage.load(key);
    if (storage == null) {
        storage = new EphemeralStorage(key);
    }
    storage.value = value;
    storage.save();
    return value;
}

export function getItemFromStorage(key: string): string | null {
    log.debug('[storage] getItemFromStorage — key: {}', [key]);
    const storage = EphemeralStorage.load(key);
    if (storage == null) {
        return null;
    }
    return storage.value;
}

export function nullifyItem(key: string): void {
    log.debug('[storage] nullifyItem — key: {}', [key]);
    const storage = EphemeralStorage.load(key);
    if (storage != null) {
        storage.value = null;
        storage.save();
    }
}
