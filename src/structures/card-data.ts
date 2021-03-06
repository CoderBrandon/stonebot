import * as Fuse from 'fuse.js'
import HearthstoneJSON from 'hearthstonejson'
import * as winston from 'winston'

import Card from './card'

export default class CardData {
    public static findOne(pattern: string, keys: string[] = ['name']): Promise<Card> {
        return new Promise<Card>((resolve, reject) => {
            this.getLatest().then((cards: Card[]) => {
                const uncollectibleFuse: Fuse = new Fuse(
                    cards.filter((c: Card) => !c.collectible),
                    { keys, includeScore: true }
                )

                let uncollectibleOnly: boolean = false
                if (pattern.startsWith('@')) {
                    pattern = pattern.substring(1)
                    uncollectibleOnly = true
                }

                const foundUncollectible: CardFuseResult[] = uncollectibleFuse.search<CardFuseResult>(pattern)
                if (uncollectibleOnly) { return resolve(foundUncollectible[0].item as Card || undefined) }

                const collectibleFuse = new Fuse(
                    cards.filter((c: Card) => c.collectible),
                    { keys, includeScore: true }
                )
                const foundCollectible: CardFuseResult[] = collectibleFuse.search<CardFuseResult>(pattern)

                if (foundCollectible.length < 1) { return resolve(foundUncollectible[0].item || undefined) }
                if (foundUncollectible.length < 1) { return resolve(foundCollectible[0].item || undefined) }
                if (foundUncollectible[0].score < foundCollectible[0].score) {
                    return resolve(foundUncollectible[0].item)
                }
                return resolve(foundCollectible[0].item)
            }).catch((err) => reject(err))
        })
    }

    public static getLatest(): Promise<Card[]> {
        return new Promise<Card[]>((resolve, reject) => {
            try {
                this.hsjson.getLatest().then((jsonCards: HearthstoneJSONCard[]) =>
                    resolve(jsonCards.map((jCard: HearthstoneJSONCard) => new Card(jCard)))
                )
            } catch (ex) { reject(ex) }
        })
    }

    private static hsjson = new HearthstoneJSON()
}
