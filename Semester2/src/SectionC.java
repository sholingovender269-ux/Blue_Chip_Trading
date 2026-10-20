
import javax.swing.*;
import java.awt.*;
import java.awt.event.*;

public class SectionC extends JFrame {

    // Declare all components here
    JPanel panel;
    JLabel nameLabel, courseLabel, genderLabel;
    JTextField nameText;
    JComboBox<String> courseBox;
    JRadioButton maleButton, femaleButton;
    ButtonGroup gender;
    JButton submit;

    public SectionC() {

        // Create the panel and set its layout
        panel = new JPanel();
        panel.setLayout(new GridLayout(5, 2, 10, 10));

        // =====================================
        // 5.1 — JLabel and JTextField (6 marks)
        // =====================================

        nameLabel = new JLabel("Enter your name");
        nameText = new JTextField(20);

        panel.add(nameLabel);
        panel.add(nameText);

        // =====================================
        // 5.2 — JLabel and JComboBox (7 marks)
        // =====================================

        courseLabel = new JLabel("Select a course");

        String[] courses = {"IT", "Accounting", "Maths"};

        courseBox = new JComboBox<>(courses);

        panel.add(courseLabel);
        panel.add(courseBox);

        // =============================================
        // 5.3 — JRadioButton and ButtonGroup (13 marks)
        // =============================================

        genderLabel = new JLabel("Pick a gender");

        maleButton = new JRadioButton("Male");
        femaleButton = new JRadioButton("Female");

        gender = new ButtonGroup();
        gender.add(maleButton);
        gender.add(femaleButton);

        // Set the default option
        maleButton.setSelected(true);

        // Add components to the panel
        panel.add(genderLabel);
        panel.add(maleButton);
        panel.add(new JLabel(""));
        panel.add(femaleButton);

        // =====================================
        // 5.4 — JButton (4 marks)
        // =====================================

        submit = new JButton("Submit");
        panel.add(submit);

        // =====================================
        // 5.5 — ActionListener (10 marks)
        // =====================================

        submit.addActionListener(new ActionListener() {

            @Override
            public void actionPerformed(ActionEvent e) {

                String name = nameText.getText();

                String course =
                        (String) courseBox.getSelectedItem();

                String selectedGender;

                if (maleButton.isSelected()) {
                    selectedGender = "Male";
                } else {
                    selectedGender = "Female";
                }

                JOptionPane.showMessageDialog(
                        SectionC.this,
                        "Name: " + name +
                                "\nCourse: " + course +
                                "\nGender: " + selectedGender
                );
            }
        });

        // =====================================
        // WINDOW SETTINGS
        // =====================================

        add(panel);
        setTitle("Information");
        setSize(450, 300);
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setLocationRelativeTo(null);
        setVisible(true);
    }

}
