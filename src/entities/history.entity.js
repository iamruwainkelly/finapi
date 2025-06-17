"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.History = void 0;
var typeorm_1 = require("typeorm");
var History = /** @class */ (function () {
    function History() {
    }
    History.prototype.setCreatedString = function () {
        if (this.created && !this.createdString) {
            this.createdString = new Date(this.created).toISOString();
        }
    };
    __decorate([
        (0, typeorm_1.PrimaryGeneratedColumn)(),
        __metadata("design:type", Number)
    ], History.prototype, "id", void 0);
    __decorate([
        (0, typeorm_1.Column)({ type: 'varchar' }),
        __metadata("design:type", String)
    ], History.prototype, "symbol", void 0);
    __decorate([
        (0, typeorm_1.Column)({ type: 'bigint' }),
        __metadata("design:type", Number)
    ], History.prototype, "date", void 0);
    __decorate([
        (0, typeorm_1.Column)({ type: 'varchar' }),
        __metadata("design:type", String)
    ], History.prototype, "dateString", void 0);
    __decorate([
        (0, typeorm_1.Column)({ type: 'float', nullable: true }),
        __metadata("design:type", Number)
    ], History.prototype, "high", void 0);
    __decorate([
        (0, typeorm_1.Column)({ type: 'bigint', nullable: true }),
        __metadata("design:type", Number)
    ], History.prototype, "volume", void 0);
    __decorate([
        (0, typeorm_1.Column)({ type: 'float', nullable: true }),
        __metadata("design:type", Number)
    ], History.prototype, "open", void 0);
    __decorate([
        (0, typeorm_1.Column)({ type: 'float', nullable: true }),
        __metadata("design:type", Number)
    ], History.prototype, "low", void 0);
    __decorate([
        (0, typeorm_1.Column)({ type: 'float', nullable: true }),
        __metadata("design:type", Number)
    ], History.prototype, "close", void 0);
    __decorate([
        (0, typeorm_1.Column)({ type: 'float', nullable: true }),
        __metadata("design:type", Number)
    ], History.prototype, "adjclose", void 0);
    __decorate([
        (0, typeorm_1.Column)({ type: 'bigint' }),
        __metadata("design:type", Number)
    ], History.prototype, "created", void 0);
    __decorate([
        (0, typeorm_1.Column)({ type: 'varchar', nullable: true }),
        __metadata("design:type", String)
    ], History.prototype, "createdString", void 0);
    __decorate([
        (0, typeorm_1.BeforeInsert)(),
        __metadata("design:type", Function),
        __metadata("design:paramtypes", []),
        __metadata("design:returntype", void 0)
    ], History.prototype, "setCreatedString", null);
    History = __decorate([
        (0, typeorm_1.Entity)('history')
    ], History);
    return History;
}());
exports.History = History;
