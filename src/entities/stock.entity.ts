import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  BeforeInsert,
} from 'typeorm';
import { Index } from './index.entity';

@Entity()
export class Stock {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  symbol: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  created: number;

  // store the string date in ISO format
  @Column({ nullable: true })
  createdAt: string;

  @ManyToOne(() => Index, (index) => index.stocks)
  index: Index;

  @Column()
  indexSymbol: string;

  @BeforeInsert()
  setCreatedAt() {
    if (this.created && !this.createdAt) {
      this.createdAt = new Date(this.created).toISOString();
    }
  }
}
