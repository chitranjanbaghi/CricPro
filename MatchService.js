// MatchService.js
// Handles all interactions with DexieDB

/* global Dexie */

export const MatchService = {
    db: new Dexie('CricScoreDB'),
    init() {
        this.db.version(1).stores({
            matches: '++id, date, status',
            players: '++id, matchId',
            deliveries: '++id, matchId, inning'
        });
    },
    async getAllMatches() { return await this.db.matches.orderBy('date').reverse().toArray(); },
    async getLastMatch() { return await this.db.matches.orderBy('id').last(); },
    async getMatch(id) { return await this.db.matches.get(id); },
    async createMatch(data) { return await this.db.matches.add(data); },
    async updateMatch(id, data) { return await this.db.matches.update(id, data); },
    async getPlayers(matchId) { return await this.db.players.where('matchId').equals(matchId).toArray(); },
    async addPlayer(player) { return await this.db.players.add(player); },
    async getDeliveries(matchId) { return await this.db.deliveries.where('matchId').equals(matchId).toArray(); },
    async addDelivery(delivery) { return await this.db.deliveries.add(delivery); }
};