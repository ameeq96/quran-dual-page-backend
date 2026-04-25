import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AdminUser } from '../entities/admin_user.entity';
import { AppSetting } from '../entities/app_setting.entity';
import { Edition } from '../entities/edition.entity';
import { FeatureFlag } from '../entities/feature_flag.entity';

const DEFAULT_SETTINGS: Array<{ key: string; value: string }> = [
  { key: 'app_title', value: 'Quran Pak Dual Page Reader' },
  { key: 'home_hero_title', value: 'Quran Pak Dual Page Reader' },
  {
    key: 'home_hero_subtitle',
    value: 'Read, search, study, and sync your Quran experience from one dashboard.',
  },
  {
    key: 'home_quick_access_subtitle',
    value: 'Choose what you want to open. Reader tools, study flows, and content packs can all be managed from admin.',
  },
  { key: 'ai_default_language', value: 'english' },
  { key: 'ai_default_depth', value: 'fast' },
  { key: 'default_mushaf_edition', value: '16_lines' },
  { key: 'default_app_dark_mode', value: 'false' },
  { key: 'default_quran_page_dark_mode', value: 'false' },
  { key: 'default_fullscreen_reading', value: 'false' },
  { key: 'default_show_page_numbers', value: 'true' },
  { key: 'default_low_memory_mode', value: 'false' },
  { key: 'default_hifz_focus_mode', value: 'false' },
  { key: 'default_page_preset', value: 'classic' },
  { key: 'default_page_preset_enabled', value: 'false' },
  { key: 'default_page_overlay_enabled', value: 'false' },
  { key: 'default_page_reflection_enabled', value: 'true' },
];

const DEFAULT_FLAGS: string[] = [
  'feature_plans_packs',
  'feature_insights',
  'feature_audio',
  'feature_ai_studio',
  'feature_page_thumbnails',
  'feature_compare',
  'feature_kanzul_study',
];

const DEFAULT_EDITIONS: Array<{ key: string; label: string }> = [
  { key: '10_lines', label: '10 lines' },
  { key: '13_lines', label: '13 lines' },
  { key: '14_lines', label: '14 lines' },
  { key: '15_lines', label: '15 lines' },
  { key: '16_lines', label: '16 lines' },
  { key: '17_lines', label: '17 lines' },
  { key: 'kanzul_iman', label: 'Kanzul Iman' },
];

export async function seedAdmin(app: INestApplication) {
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  const dataSource = app.get(DataSource);
  const adminRepo = dataSource.getRepository(AdminUser);
  const settingsRepo = dataSource.getRepository(AppSetting);
  const flagsRepo = dataSource.getRepository(FeatureFlag);
  const editionsRepo = dataSource.getRepository(Edition);

  if (email && password) {
    const existing = await adminRepo.findOne({ where: { email } });
    if (!existing) {
      const passwordHash = await bcrypt.hash(password, 10);
      await adminRepo.save(
        adminRepo.create({
          email,
          passwordHash,
          role: 'admin',
          active: true,
        }),
      );
    }
  }

  for (const setting of DEFAULT_SETTINGS) {
    const existing = await settingsRepo.findOne({ where: { key: setting.key } });
    if (!existing) {
      await settingsRepo.save(settingsRepo.create(setting));
    }
  }

  for (const key of DEFAULT_FLAGS) {
    const existing = await flagsRepo.findOne({ where: { key } });
    if (!existing) {
      await flagsRepo.save(flagsRepo.create({ key, enabled: true }));
    }
  }

  for (const edition of DEFAULT_EDITIONS) {
    const existing = await editionsRepo.findOne({ where: { key: edition.key } });
    if (!existing) {
      await editionsRepo.save(editionsRepo.create({ ...edition, enabled: true }));
    }
  }
}
