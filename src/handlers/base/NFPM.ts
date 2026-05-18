import { BD_ZERO, ZERO_ADDRESS } from '../../utils/constants';
import { divideByBase } from '../../utils/math';
import {
    Transfer as TransferEvent,
    IncreaseLiquidity as IncreaseLiquidityEvent,
    DecreaseLiquidity as DecreaseLiquidityEvent,
} from '../../../generated/NonfungiblePositionManager/NonfungiblePositionManager';
import { CLPosition, LiquidityPosition, User } from '../../../generated/schema';
import { getItemFromStorage, nullifyItem } from '../../utils/storage';

export function handleTransfer(event: TransferEvent): void {
    const sender = event.params.from;
    const recipient = event.params.to;
    const isBurn = recipient.toHex() === ZERO_ADDRESS;
    const isTransfer = sender.toHex() !== ZERO_ADDRESS && recipient.toHex() !== ZERO_ADDRESS;
    const isMint = sender.toHex() === ZERO_ADDRESS;
    const tokenId = event.params.tokenId;
    let user = User.load(recipient.toHex());

    if (user === null) {
        user = new User(recipient.toHex());
        user.address = recipient;
        user.save();
    }

    if (isMint) {
        const transactionId = event.transaction.hash.toHex();
        const poolId = getItemFromStorage(transactionId);

        if (poolId === null) {
            return; // Pool not found in storage, cannot proceed
        }
        // LP position has been created already, so update
        const lpId = event.address.toHex() + '-' + poolId;
        const lp = LiquidityPosition.load(lpId) as LiquidityPosition;
        lp.account = user.id;
        lp.clPositionTokenId = tokenId;
        lp.save();

        nullifyItem(transactionId);
        // We want to associate the CL position with the tokenId, so we can easily query it in the demanding handlers.
        const clPosition = new CLPosition(tokenId.toString());
        clPosition.pool = poolId;
        clPosition.save();
    }

    if (isTransfer) {
        const clPosition = CLPosition.load(tokenId.toString()) as CLPosition;
        const lpId = event.address.toHex() + '-' + clPosition.pool;
        const lp = LiquidityPosition.load(lpId) as LiquidityPosition;
        lp.account = user.id;
        lp.save();
    }

    if (isBurn) {
        const clPosition = CLPosition.load(tokenId.toString()) as CLPosition;
        const lpId = event.address.toHex() + '-' + clPosition.pool;
        const lp = LiquidityPosition.load(lpId) as LiquidityPosition;
        lp.account = null;
        lp.position = BD_ZERO;
        lp.save();
    }
}

export function handleIncreaseLiquidity(event: IncreaseLiquidityEvent): void {
    const tokenId = event.params.tokenId;
    const clPosition = CLPosition.load(tokenId.toString()) as CLPosition;
    const lpId = event.address.toHex() + '-' + clPosition.pool;
    const lp = LiquidityPosition.load(lpId) as LiquidityPosition;
    const amount = divideByBase(event.params.liquidity);

    lp.position = lp.position.plus(amount);
    lp.save();
}

export function handleDecreaseLiquidity(event: DecreaseLiquidityEvent): void {
    const tokenId = event.params.tokenId;
    const clPosition = CLPosition.load(tokenId.toString()) as CLPosition;
    const lpId = event.address.toHex() + '-' + clPosition.pool;
    const lp = LiquidityPosition.load(lpId) as LiquidityPosition;
    const amount = divideByBase(event.params.liquidity);

    lp.position = lp.position.minus(amount);
    lp.save();
}
