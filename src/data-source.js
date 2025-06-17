"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppDataSource = void 0;
var typeorm_1 = require("typeorm");
exports.AppDataSource = new typeorm_1.DataSource({
    type: 'better-sqlite3',
    database: './src/data/data.db',
    entities: [__dirname + '/**/*.entity{.ts,.js}'],
    synchronize: true,
});
