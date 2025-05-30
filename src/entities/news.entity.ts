// news entity
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  BeforeInsert,
} from 'typeorm';

@Entity()
export class News {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  symbol: string;

  @Column({ nullable: true })
  json: string;

  // created is a timestamp in seconds
  @Column()
  created: number;

  @Column()
  createdAt: string;

  @BeforeInsert()
  setCreatedAt() {
    if (this.created && !this.createdAt) {
      this.createdAt = new Date(this.created).toISOString();
    }
  }
}
