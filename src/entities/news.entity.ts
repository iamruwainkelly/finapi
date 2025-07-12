// news entity
import { Entity, Column, PrimaryGeneratedColumn, BeforeInsert } from 'typeorm';

@Entity()
export class News {
  @PrimaryGeneratedColumn()
  id?: number;

  @Column()
  symbol?: string;

  // title
  @Column({ nullable: true })
  title: string;

  // url
  @Column({ nullable: true })
  url: string;

  // image
  @Column({ nullable: true })
  imageUrl: string;

  // date
  @Column({ nullable: true })
  date: number;

  // provider
  @Column({ nullable: true })
  provider: string;

  // created is a timestamp in seconds
  @Column()
  created?: number;

  @Column({ nullable: true })
  createdString?: string;

  // updated
  @Column({ nullable: true })
  updated: number;

  // updatedAt
  @Column({ nullable: true })
  updatedString: string;
}
