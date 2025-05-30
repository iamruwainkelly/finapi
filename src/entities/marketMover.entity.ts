// create entity with the following fields:
// - id: number
// - symbol: string
// - json: string
// - created: number
// - createdAt: string

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
} from 'typeorm';

@Entity()
export class MarketMover {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  symbol: string;

  @Column('json', { nullable: true })
  json: string;

  @Column({ type: 'bigint', nullable: true })
  created: number;

  @Column({ nullable: true })
  createdAt: string;

  @BeforeInsert()
  setCreatedAt() {
    if (this.created && !this.createdAt) {
      this.createdAt = new Date(this.created).toISOString();
    }
  }
}
