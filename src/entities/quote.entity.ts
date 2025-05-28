import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
} from 'typeorm';

@Entity()
export class Quote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  symbol: string;

  // store json
  @Column({ type: 'json', nullable: true })
  json: any;

  @Column({ nullable: true })
  created: number;

  // store the string date in ISO format
  @Column({ nullable: true })
  createdAt: string;

  // upatedAt is automatically managed by TypeORM
  @Column({ nullable: true })
  updated: number;

  @Column({ nullable: true })
  updatedAt: string;

  @BeforeInsert()
  setCreatedAt() {
    if (this.created && !this.createdAt) {
      this.createdAt = new Date(this.created).toISOString();
    }
  }

  @BeforeInsert()
  setUpdatedAt() {
    if (this.updated && !this.updatedAt) {
      this.updatedAt = new Date(this.updated).toISOString();
    }
  }
}
