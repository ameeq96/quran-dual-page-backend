import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('announcements')
export class Announcement {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ default: true })
  active!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  publishAt!: Date | null;
}
