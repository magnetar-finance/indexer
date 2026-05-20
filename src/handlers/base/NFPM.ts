import { BD_ZERO, ZERO_ADDRESS } from '../../utils/constants';
import { divideByBase } from '../../utils/math';
import {
    Transfer as TransferEvent,
    IncreaseLiquidity as IncreaseLiquidityEvent,
    DecreaseLiquidity as DecreaseLiquidityEvent,
} from '../../../generated/NonfungiblePositionManager/NonfungiblePositionManager';
import { CLPosition, LiquidityPosition, User } from '../../../generated/schema';
import { getItemFromStorage, nullifyItem } from '../../utils/storage';
import { log } from 'matchstick-as';

export function handleTransfer(event: TransferEvent): void {
    const sender = event.params.from;
    const recipient = event.params.to;
    const isBurn = recipient.toHex() == ZERO_ADDRESS;
    const isTransfer = sender.toHex() != ZERO_ADDRESS && recipient.toHex() != ZERO_ADDRESS;
    const isMint = sender.toHex() == ZERO_ADDRESS;
    const tokenId = event.params.tokenId;
    log.info('[NFPM] handleTransfer — tokenId: {}, from: {}, to: {}, type: {}', [
        tokenId.toString(),
        sender.toHex(),
        recipient.toHex(),
        isMint ? 'MINT' : isBurn ? 'BURN' : 'TRANSFER',
    ]);
    let user = User.load(recipient.toHex());

    if (user == null) {
        user = new User(recipient.toHex());
        user.address = recipient;
        user.save();
    }

    const transactionId = event.transaction.hash.toHex();
    const poolId = getItemFromStorage(transactionId);

    if (isMint && poolId == null) {
        log.warning('Pool ID not found in storage for transaction {}. Skipping mint event for token ID {}.', [
            transactionId,
            tokenId.toString(),
        ]);
        return; // Pool not found in storage, cannot proceed
    }

    let clPosition = CLPosition.load(tokenId.toString());
    if (clPosition == null) {
        clPosition = new CLPosition(tokenId.toString());
        clPosition.pool = poolId as string;
        clPosition.save();
    }

    if (isMint) {
        log.info('[NFPM] Mint confirmed — updating LP position for tokenId: {}, pool: {}', [
            tokenId.toString(),
            clPosition.pool,
        ]);
        const lpId = event.address.toHex() + '-' + clPosition.pool;
        const lp = LiquidityPosition.load(lpId) as LiquidityPosition;
        lp.account = user.id;
        lp.clPositionTokenId = tokenId;
        lp.save();

        nullifyItem(transactionId);
    }

    if (isTransfer) {
        log.info('[NFPM] Transfer — reassigning LP owner for tokenId: {}', [tokenId.toString()]);
        const lpId = event.address.toHex() + '-' + clPosition.pool;
        const lp = LiquidityPosition.load(lpId) as LiquidityPosition;
        lp.account = user.id;
        lp.save();
    }

    if (isBurn) {
        log.info('[NFPM] Burn — clearing LP position for tokenId: {}', [tokenId.toString()]);
        const lpId = event.address.toHex() + '-' + clPosition.pool;
        const lp = LiquidityPosition.load(lpId) as LiquidityPosition;
        lp.account = null;
        lp.position = BD_ZERO;
        lp.save();
    }
}

export function handleIncreaseLiquidity(event: IncreaseLiquidityEvent): void {
    const tokenId = event.params.tokenId;
    log.info('[NFPM] handleIncreaseLiquidity — tokenId: {}, liquidity: {}', [
        tokenId.toString(),
        event.params.liquidity.toString(),
    ]);
    const clPosition = CLPosition.load(tokenId.toString()) as CLPosition;
    const lpId = event.address.toHex() + '-' + clPosition.pool;
    const lp = LiquidityPosition.load(lpId) as LiquidityPosition;
    const amount = divideByBase(event.params.liquidity);

    lp.position = lp.position.plus(amount);
    lp.save();
}

export function handleDecreaseLiquidity(event: DecreaseLiquidityEvent): void {
    const tokenId = event.params.tokenId;
    log.info('[NFPM] handleDecreaseLiquidity — tokenId: {}, liquidity: {}', [
        tokenId.toString(),
        event.params.liquidity.toString(),
    ]);
    const clPosition = CLPosition.load(tokenId.toString()) as CLPosition;
    const lpId = event.address.toHex() + '-' + clPosition.pool;
    const lp = LiquidityPosition.load(lpId) as LiquidityPosition;
    const amount = divideByBase(event.params.liquidity);

    lp.position = lp.position.minus(amount);
    lp.save();
}
