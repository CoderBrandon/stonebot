import Card from '../../card/card'
import { Command } from 'discord.js-commando'
import SoundProcessor from '../../sound-processor'

import fs from 'fs'
import { soundKind, cardName } from '../../command-arguments'
import winston from 'winston'

const SOUND_KINDS = ['play', 'attack', 'trigger', 'death']

module.exports = class SoundCommand extends Command {
    constructor(client) {
        let nameWithDefault = { default: '' }
        Object.assign(nameWithDefault, cardName)
        super(client, {
            name: 'sound',
            aliases: ['snd', 's', '🔈', '🔉', '🔊', '🎧', '🎵'],
            group: 'card',
            memberName: 'sound',
            guildOnly: true,
            description: 'Plays card sound in your voice channel.',
            format:'[kind] <name>',
            examples: [
                'sound tirion',
                'sound attack jaraxxus',
                'sound death refreshment vendor',
                'sound trigger antonaidas'
            ],
            args: [ soundKind, nameWithDefault ]
        })

        this.queue = []
    }

    async run(msg, args) {
        if (!msg.channel.typing) { msg.channel.startTyping() }
        if (!SOUND_KINDS.includes(args.soundKind)) {
            args.cardName = `${args.soundKind} ${args.cardName}`.trim()
            args.soundKind = 'play'
        }
        if (!args.cardName) {
            this.args[1].default = null
            args.cardName = await this.args[1].obtain(msg).catch(winston.error)
        }
        const card = await Card.findByName(args.cardName).catch(winston.error)
        const soundFilenames = card.getSoundFilenames(args.soundKind)
        if (!soundFilenames) {
            if (msg.channel.typing) { msg.channel.stopTyping() }
            return msg.reply(`sorry, I don't know the ${args.soundKind} sound for ${card.name}.`).catch(winston.error)
        }
        this.queue.push({ message: msg, soundFilenames: soundFilenames })
        if (this.queue.length === 1) { this.handleSound().catch(winston.error) }
        if (msg.channel.typing) { msg.channel.stopTyping() }
        return msg.reply(`I'll join your voice channel and play the ${args.soundKind} sound for ${card.name} in a moment.`).catch(winston.error)
    }

    async handleSound() {
        const message = this.queue[0].message
        const soundFilenames = this.queue[0].soundFilenames
        const file = await SoundProcessor.mergeSounds(soundFilenames).catch(winston.error)
        const connection = await this.joinVoiceChannel(message.member.voiceChannel).catch(winston.error)
        if (!connection || typeof connection === 'string') {
            this.queue.shift()
            fs.unlink(file, err => { if (err) { winston.error(err) } })
            if (message.member.voiceChannel) { message.member.voiceChannel.leave() }
            message.reply(`sorry, there was an error joining your voice channel, ${connection || 'unkown'}`).catch(winston.error)
            if (this.queue.length > 0) { this.handleSound() }
            return
        }
        connection.playFile(file).on('end', () => {
            this.queue.shift()
            fs.unlink(file, err => { if (err) { winston.error(err) } })
            if (this.queue.length > 0) {
                if (this.queue[0].message.member.voiceChannel !== connection.channel) { connection.channel.leave() }
                this.handleSound()
            } else {
                connection.channel.leave()
            }
        })
    }

    async joinVoiceChannel(voiceChannel) {
        if (!voiceChannel || voiceChannel.type !== 'voice') { return 'you\'re not in one' }
        let connection = this.client.voiceConnections.find(conn => conn.channel === voiceChannel)
        if (connection) { return connection }
        return await voiceChannel.join().catch(err => { return err.message.replace('You', 'I') })
    }
}
