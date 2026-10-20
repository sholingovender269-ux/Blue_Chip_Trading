import javax.swing.*;
import java.awt.*;
import java.awt.event.*;

public class Activity7 {

    public static void main(String[] args) {
        JFrame frame = new JFrame("Activity 7");
        frame.setSize(400, 300);
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        frame.setLayout(new BorderLayout());


        JPanel comboPanel = new JPanel();
        String[] countries = {"South Africa", "India", "Brazil"};
        JComboBox<String> comboBox = new JComboBox<>(countries);
        JLabel selectedLabel = new JLabel("Selected: South Africa");

        comboBox.addActionListener(new ActionListener() {
            public void actionPerformed(ActionEvent e) {
                String choice = (String) comboBox.getSelectedItem();
                selectedLabel.setText("Selected: " + choice);
            }
        });

        comboPanel.add(new JLabel("Choose a country:"));
        comboPanel.add(comboBox);
        comboPanel.add(selectedLabel);

        //  TabbedPane
        JTabbedPane tabbedPane = new JTabbedPane();

        JPanel homeTab = new JPanel();
        homeTab.add(new JLabel("Welcome to the Home tab!"));

        JPanel profileTab = new JPanel();
        profileTab.add(new JLabel("This is your Profile."));

        JPanel settingsTab = new JPanel();
        settingsTab.add(new JLabel("Adjust your Settings here."));

        tabbedPane.addTab("Home", homeTab);
        tabbedPane.addTab("Profile", profileTab);
        tabbedPane.addTab("Settings", settingsTab);

        frame.add(comboPanel, BorderLayout.NORTH);
        frame.add(tabbedPane, BorderLayout.CENTER);

        frame.setVisible(true);
    }
}