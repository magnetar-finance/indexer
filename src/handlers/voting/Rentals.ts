import { log } from '@graphprotocol/graph-ts';
import { Rental, User } from '../../../generated/schema';
import {
    StatusChange as StatusChangeEvent,
    Reaped as ReapedEvent,
    NewBuyer as NewBuyerEvent,
} from '../../../generated/templates/VERental/VERental';

export function handleStatusChange(event: StatusChangeEvent): void {
    const rentalId = event.address.toHex();
    const rental = Rental.load(rentalId) as Rental;
    const newStatus = event.params.newStatus;

    if (newStatus == 1) {
        rental.status = 'EXPIRED';
    } else if (newStatus == 2) {
        rental.status = 'RENTED_OUT';
    }

    log.debug('[auto] saving entity: {}', ['rental']);

    rental.save();
}

export function handleNewBuyer(event: NewBuyerEvent): void {
    const rentalId = event.address.toHex();
    const rental = Rental.load(rentalId) as Rental;

    const userId = event.params.buyer.toHex();
    let user = User.load(userId);

    if (user == null) {
        user = new User(userId);
        user.address = event.params.buyer;

        log.debug('[auto] saving entity: {}', ['user']);

        user.save();
    }

    rental.buyer = user.id;
    log.debug('[auto] saving entity: {}', ['rental']);
    rental.save();
}

export function handleReaped(event: ReapedEvent): void {
    const rentalId = event.address.toHex();
    const rental = Rental.load(rentalId) as Rental;

    rental.reaped = true;
    log.debug('[auto] saving entity: {}', ['rental']);
    rental.save();
}
