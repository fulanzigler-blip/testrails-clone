import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create default organization
  const org = await prisma.organization.upsert({
    where: { slug: 'testrails' },
    update: { name: 'TestRails' },
    create: { name: 'TestRails', slug: 'testrails' },
  });
  console.log('✅ Organization created:', org.name);

  // Create admin user
  const hashedPassword = await bcrypt.hash('Admin1234!', 10);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@testrails.com' },
    update: {
      email: 'admin@testrails.com',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      emailVerified: true,
      organizationId: org.id,
    },
    create: {
      email: 'admin@testrails.com',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      emailVerified: true,
      passwordHash: hashedPassword,
      organizationId: org.id,
    },
  });
  console.log('✅ Admin user created:', admin.email);

  // Create a default project
  const project = await prisma.project.create({
    data: {
      name: 'Test Project',
      description: 'Default project for testing',
      organizationId: org.id,
    },
  });
  console.log('✅ Project created:', project.name);

  // Create a test suite
  const testSuite = await prisma.testSuite.create({
    data: {
      name: 'Default Suite',
      description: 'Default test suite for testing',
      projectId: project.id,
    },
  });
  console.log('✅ Test suite created:', testSuite.name);

  // Create sample test cases
  const testCase1 = await prisma.testCase.create({
    data: {
      title: 'Test user registration',
      description: 'Verify user can register successfully',
      steps: [
        { step: 1, expectedResult: 'Enter valid email', actualResult: '' },
        { step: 2, expectedResult: 'Enter valid password', actualResult: '' },
        { step: 3, expectedResult: 'Click register button', actualResult: '' },
        { step: 4, expectedResult: 'Redirect to login', actualResult: '' },
      ],
      status: 'draft',
      priority: 'medium',
        suiteId: testSuite.id,
        createdById: admin.id,
    },
  });

  const testCase2 = await prisma.testCase.create({
    data: {
      title: 'Test user login',
      description: 'Verify user can login with correct credentials',
      steps: [
        { step: 1, expectedResult: 'Navigate to login page', actualResult: '' },
        { step: 2, expectedResult: 'Enter email', actualResult: '' },
        { step: 3, expectedResult: 'Enter password', actualResult: '' },
        { step: 4, expectedResult: 'Click login button', actualResult: '' },
        { step: 5, expectedResult: 'Verify dashboard access', actualResult: '' },
      ],
      status: 'draft',
      priority: 'high',
        suiteId: testSuite.id,
        createdById: admin.id,
    },
  });
  console.log('✅ Created 2 test cases:', testCase1.title, testCase2.title);

  console.log('🎉 Database seeding completed!');
  console.log('');
  console.log('Login credentials:');
  console.log('Email: admin@testrails.com');
  console.log('Password: Admin1234!');
}

main()
  .then(() => {
    console.log('✅ Seeding successful!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  });
