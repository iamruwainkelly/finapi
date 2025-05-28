import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  BeforeInsert,
} from 'typeorm';
import { Stock } from './stock.entity';

@Entity()
export class Index {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  symbol: string;

  // investingSymbol
  @Column({ nullable: true })
  investingSymbol: string;

  @Column({ nullable: true })
  investingUrlName: string;

  @OneToMany(() => Stock, (stock) => stock.index)
  stocks: Stock[];

  @Column({ nullable: true })
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
